"""Song recognition.

Shazam's free endpoint (via shazamio) allows only about 3 requests in a burst and then
roughly one every 15-20 seconds per IP address. Checking every 12 s segment of a video
would take minutes, so instead we check a few segments and spend more requests only
where it helps:

1. Start with a few checks. Videos up to CHECK_ALL_SECTIONS_SECONDS (Shorts, reels) get
   one check per section found by the song-change detector (changes.py), so every song
   in a montage is heard. Longer videos get checks spread across the video.
2. If two checks found the same song *and* Shazam's position in the song lines up with
   continuous playback, everything between them is that song. If the positions don't
   line up, the video was edited in between, so check in between too. Same if they are
   more than INFER_MAX_GAP_SECONDS apart.
3. If two neighbouring checks found different results, check the middle segment to
   narrow down where one song ends and the next begins.
4. If nothing was found yet, check the biggest unchecked gaps instead.

Everything stops at the request budget or time budget. A shared rate limiter spaces
requests out so they wait instead of being rejected.
"""

import asyncio
import logging
import math
import time

from aiohttp_retry import ExponentialRetry
from shazamio import Shazam
from shazamio.client import HTTPClient
from shazamio.exceptions import RateLimited

from . import audio, config
from .errors import AudioError

log = logging.getLogger("audio-service.recognize")

# A match whose time/frequency skew is above this is less trustworthy. shazamio measured that
# 1e-3 rejects most wrong answers while keeping ~97% of right ones. We don't drop these hits
# (sped-up or pitch-shifted edits legitimately have skew); we just give them less weight.
CLEAN_SKEW = 1e-3

# How much one checked segment contributes to confidence. Based on shazamio's measurements
# (234 songs): of answers with skew <= 1e-3, 596 were right and 5 wrong (~99%); of skewed
# answers, 15 right and 23 wrong (~40%). We use 0.9 for clean hits to stay a bit cautious,
# since YouTube audio often has speech or effects on top of the music.
CLEAN_HIT_WEIGHT = 0.9
SKEWED_HIT_WEIGHT = 0.4

# Two checks of the same song count as "continuous playback" if their implied song start
# times (segment start - position in the song) agree within this many seconds
ANCHOR_TOLERANCE_SECONDS = 3.0

# Segment statuses reported to the UI
MATCHED, INFERRED, NO_MATCH, SKIPPED, FAILED = "matched", "inferred", "no_match", "skipped", "failed"


# ---------- Rate limiting ----------

class RateLimiter:
    """Token bucket shared by all requests: `burst` calls at once, then one per `refill` seconds."""

    def __init__(self, burst: int, refill_seconds: float):
        self.burst = burst
        self.refill = refill_seconds
        self.tokens = float(burst)
        self.updated = time.monotonic()
        self.blocked_until = 0.0
        self._lock = asyncio.Lock()

    def _top_up(self, now: float) -> None:
        self.tokens = min(self.burst, self.tokens + (now - self.updated) / self.refill)
        self.updated = now

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._top_up(now)
                if now < self.blocked_until:
                    await asyncio.sleep(self.blocked_until - now)
                elif self.tokens >= 1:
                    self.tokens -= 1
                    return
                else:
                    await asyncio.sleep((1 - self.tokens) * self.refill)

    def penalize(self, seconds: float) -> None:
        """Shazam said we're going too fast: pause everyone and empty the bucket."""
        self.blocked_until = max(self.blocked_until, time.monotonic() + seconds)
        self.tokens = 0


_limiter: RateLimiter | None = None


def limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(config.SHAZAM_BURST, config.SHAZAM_REFILL_SECONDS)
    return _limiter


# ---------- Parsing a single Shazam answer ----------

def _section_metadata(track: dict) -> dict:
    """The 'SONG' section holds Album / Label / Released as a list of {title, text}."""
    for section in track.get("sections") or []:
        if section.get("type") == "SONG":
            return {m.get("title"): m.get("text") for m in section.get("metadata") or []}
    return {}


def _preview_url(track: dict) -> str | None:
    for action in (track.get("hub") or {}).get("actions") or []:
        uri = action.get("uri") or ""
        if action.get("type") == "uri" and uri.startswith("http"):
            return uri
    return None


def parse_answer(answer: dict) -> dict | None:
    """Turn a raw Shazam response into a compact hit, or None if nothing matched."""
    matches = answer.get("matches") or []
    track = answer.get("track")
    if not matches or not track or not track.get("key"):
        return None

    first = matches[0]
    skew = max(abs(first.get("timeskew") or 0), abs(first.get("frequencyskew") or 0))
    meta = _section_metadata(track)
    images = track.get("images") or {}

    return {
        "key": str(track["key"]),
        "title": track.get("title"),
        "artist": track.get("subtitle"),
        "album": meta.get("Album"),
        "label": meta.get("Label"),
        "year": meta.get("Released"),
        "genre": (track.get("genres") or {}).get("primary"),
        "isrc": track.get("isrc"),
        "coverUrl": images.get("coverarthq") or images.get("coverart"),
        "shazamUrl": track.get("url"),
        "previewUrl": _preview_url(track),
        "offset": round(first.get("offset") or 0, 2),  # where in the track this clip comes from
        "skew": skew,
        # Other catalogue tracks matching the same audio (versions, covers, mashups)
        "altKeys": list(dict.fromkeys(
            str(m["id"]) for m in matches[1:6] if m.get("id") and str(m["id"]) != str(track["key"])
        )),
    }


# ---------- Choosing which segments to check ----------

def initial_probes(n: int, k: int) -> list[int]:
    """k segment positions spread evenly across n segments (centre of each k-th slice)."""
    k = min(n, k)
    return sorted({min(n - 1, int((i + 0.5) * n / k)) for i in range(k)})


def _outcome(r: dict | None):
    """What a checked segment found, for comparing neighbours: a song key, None, or FAILED."""
    if r is None:
        return SKIPPED
    if r["error"]:
        return FAILED
    return r["hit"]["key"] if r["hit"] else None


def continuous(a: dict, b: dict, start_a: float, start_b: float) -> bool:
    """Do two hits of the same song look like one uninterrupted playback?

    Each hit says where in the song the clip comes from (offset). If the song simply kept
    playing, (video time - song position) is the same for both. A sped-up/slowed edit
    drifts by its time skew, so that is allowed for too.
    """
    anchor_a = start_a - a.get("offset", 0)
    anchor_b = start_b - b.get("offset", 0)
    drift = abs(start_b - start_a) * max(a.get("skew", 0), b.get("skew", 0)) * 1.5
    return abs(anchor_a - anchor_b) <= ANCHOR_TOLERANCE_SECONDS + drift


def _same_song_gap_is_safe(checked: dict[int, dict], a: int, b: int, starts) -> bool:
    if starts is None:
        return True
    return continuous(checked[a]["hit"], checked[b]["hit"], starts[a], starts[b])


def next_probe(
    n: int, checked: dict[int, dict], max_gap: int | None = None, starts: list[float] | None = None
) -> int | None:
    """Pick the next segment worth checking, or None if more checks wouldn't help.

    Priority 1: the middle of the widest unchecked gap between two checks that disagree
    (a song boundary is somewhere in there).
    Priority 2: a gap between two checks of the same song that is wider than `max_gap`
    segments, or where the song positions show an edit (see `continuous`). Needs `starts`
    (segment start times) for the edit check.
    Priority 3 (only while no song has been found): the middle of the widest unchecked
    gap anywhere, including the start and end of the video.
    Gaps at the start/end are otherwise not refined: each extra request costs ~18 s once
    Shazam's burst allowance is used, and the initial checks are spread across the video.
    """
    if len(checked) >= n:
        return None
    if max_gap is None:
        max_gap = math.ceil(config.INFER_MAX_GAP_SECONDS / config.SEGMENT_SECONDS)

    positions = sorted(checked)
    boundary, suspicious, anywhere = [], [], []  # (width, a, b); unchecked run is a+1 .. b-1
    bounds = [-1, *positions, n]
    for a, b in zip(bounds, bounds[1:]):
        width = b - a - 1
        if width <= 0:
            continue
        anywhere.append((width, a, b))
        if a < 0 or b >= n:
            continue
        left, right = _outcome(checked[a]), _outcome(checked[b])
        if left != right:
            boundary.append((width, a, b))
        elif left not in (None, FAILED) and (
            width > max_gap or not _same_song_gap_is_safe(checked, a, b, starts)
        ):
            suspicious.append((width, a, b))

    if boundary:
        _, a, b = max(boundary)
    elif suspicious:
        _, a, b = max(suspicious)
    elif anywhere and not any(r["hit"] for r in checked.values()):
        _, a, b = max(anywhere)
    else:
        return None
    return (a + b) // 2  # a may be -1 and b may be n; the middle is always unchecked


def fill_in(n: int, checked: dict[int, dict], starts: list[float] | None = None) -> list[dict]:
    """Final status for every segment. Unchecked runs between two checks of the same song
    are 'inferred' to be that song, unless the song positions show an edit in between
    (needs `starts`); everything else unchecked is 'skipped'."""
    out = []
    for i in range(n):
        if i in checked:
            r = checked[i]
            status = FAILED if r["error"] else MATCHED if r["hit"] else NO_MATCH
            out.append({"index": i, "hit": r["hit"], "error": r["error"], "status": status})
        else:
            out.append({"index": i, "hit": None, "error": None, "status": SKIPPED})

    positions = sorted(checked)
    for a, b in zip(positions, positions[1:]):
        ka, kb = _outcome(checked[a]), _outcome(checked[b])
        same = ka is not None and ka not in (FAILED, SKIPPED) and ka == kb
        if same and _same_song_gap_is_safe(checked, a, b, starts):
            for i in range(a + 1, b):
                out[i] = {"index": i, "hit": checked[a]["hit"], "error": None, "status": INFERRED}
    return out


def first_checks(segments: list[dict]) -> list[int]:
    """Which segments to check first, in order.

    Short videos: one per section (sections come from silence and the song-change
    detector), longest sections first, using the longest segment near each section's
    middle. Longer videos: about one per 3 minutes, spread evenly.
    """
    n = len(segments)
    span = segments[-1]["end"] - segments[0]["start"]
    if span <= config.CHECK_ALL_SECTIONS_SECONDS:
        by_section: dict[int, list[int]] = {}
        for i, seg in enumerate(segments):
            by_section.setdefault(seg.get("section", 0), []).append(i)

        def length(i):
            return segments[i]["end"] - segments[i]["start"]

        picks = []
        for members in by_section.values():
            middle = (members[0] + members[-1]) / 2
            best = max(members, key=lambda i: (round(length(i)), -abs(i - middle)))
            picks.append((sum(length(i) for i in members), best))
        return [best for _, best in sorted(picks, key=lambda p: -p[0])]

    k = min(max(config.RECOGNIZE_INITIAL_PROBES, math.ceil(span / 180)), 6, config.RECOGNIZE_MAX_REQUESTS)
    return initial_probes(n, k)


# ---------- Calling Shazam ----------

async def _check(shazam: Shazam, audio_path, segment: dict, deadline: float) -> dict:
    """Recognize one segment, waiting for the rate limiter and retrying if Shazam pushes back.
    Gives up (error "RateLimited") rather than wait past the deadline."""
    clip = await asyncio.to_thread(audio.read_segment, audio_path, segment["start"], segment["end"])
    for _ in range(config.SHAZAM_MAX_RETRIES + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            await asyncio.wait_for(limiter().acquire(), timeout=remaining)
        except TimeoutError:
            break
        try:
            answer = await asyncio.wait_for(
                shazam.recognize(clip), timeout=config.RECOGNIZE_TIMEOUT_SECONDS
            )
            return {"hit": parse_answer(answer), "error": None}
        except RateLimited:
            log.info("Rate limited by Shazam, pausing %ss", config.SHAZAM_COOLDOWN_SECONDS)
            limiter().penalize(config.SHAZAM_COOLDOWN_SECONDS)
        except Exception as err:  # one bad segment shouldn't sink the whole video
            log.warning("Segment %s failed: %r", segment["index"], err)
            return {"hit": None, "error": type(err).__name__}
    return {"hit": None, "error": "RateLimited"}


async def recognize_segments(segments: list[dict], audio_path) -> list[dict]:
    """Check a smart subset of segments of the WAV at audio_path. Returns one entry per
    segment, in order, with a status of matched / inferred / no_match / skipped / failed."""
    n = len(segments)
    if n == 0:
        return []

    checked: dict[int, dict] = {}
    starts = [seg["start"] for seg in segments]
    started = time.monotonic()
    # Everything (waiting for the rate limiter included) must finish by this time
    deadline = started + config.RECOGNIZE_TIME_BUDGET_SECONDS
    # Our own limiter handles pacing, so turn off shazamio's long built-in retry loop
    client = HTTPClient(retry_options=ExponentialRetry(attempts=1))
    try:
        async with Shazam(http_client=client) as shazam:
            # Short videos: one check per section; longer ones: a few spread out (see first_checks)
            for pos in first_checks(segments):
                if time.monotonic() >= deadline or len(checked) >= config.RECOGNIZE_MAX_REQUESTS:
                    break
                checked[pos] = await _check(shazam, audio_path, segments[pos], deadline)

            # A single match that looks unreliable (sped up, pitch-shifted or a likely wrong
            # answer) gets a second opinion from another segment
            only = next(iter(checked.values()), None) if len(checked) == 1 else None
            if only and only["hit"] and only["hit"]["skew"] > CLEAN_SKEW and n > 1 and time.monotonic() < deadline:
                pos = next(i for i in range(n) if i not in checked)
                checked[pos] = await _check(shazam, audio_path, segments[pos], deadline)

            while len(checked) < config.RECOGNIZE_MAX_REQUESTS and time.monotonic() < deadline:
                pos = next_probe(n, checked, starts=starts)
                if pos is None or pos in checked:
                    break
                checked[pos] = await _check(shazam, audio_path, segments[pos], deadline)
    finally:
        await client.close()

    if time.monotonic() >= deadline:
        log.info("Recognition time budget used up after %d checks", len(checked))

    if not checked or all(r["error"] for r in checked.values()):
        busy = not checked or any(r["error"] == "RateLimited" for r in checked.values())
        raise AudioError(
            "The song recognition service is busy. Please try again in a minute."
            if busy
            else "The song recognition service is not responding. Please try again later.",
            503 if busy else 502,
            "recognition_busy" if busy else "recognition_unavailable",
        )

    log.info("Checked %d of %d segments in %.1fs", len(checked), n, time.monotonic() - started)
    return fill_in(n, checked, starts)


# ---------- Merging segment results into songs ----------

def confidence(hits: list[dict]) -> float:
    """Each agreeing check adds independent evidence: 1 - product of (1 - weight)."""
    miss = math.prod(
        1 - (CLEAN_HIT_WEIGHT if h["skew"] <= CLEAN_SKEW else SKEWED_HIT_WEIGHT) for h in hits
    )
    return round(min(0.99, 1 - miss), 2)


def merge_results(segments: list[dict], results: list[dict]) -> list[dict]:
    """Group segment results by song and build the time ranges where each song plays.

    Checked and inferred segments both count towards the time ranges; only checked ones
    count towards confidence. Neighbouring runs of the same song are joined across one
    segment that found nothing (Shazam occasionally misses a clip), as long as no other
    song is in between and the time gap is small. Songs are returned in order of first
    appearance.
    """
    by_index = {s["index"]: s for s in segments}
    hit_at = {r["index"]: r for r in results if r["hit"]}
    max_gap = config.SEGMENT_SECONDS * 2 + 1

    songs: dict[str, dict] = {}
    for idx in sorted(hit_at):
        r = hit_at[idx]
        hit = r["hit"]
        seg = by_index[idx]
        song = songs.get(hit["key"])
        if song is None:
            song = songs[hit["key"]] = {
                **{k: v for k, v in hit.items() if k not in ("offset", "skew", "altKeys")},
                "altKeys": [],
                "hits": [],
                "appearances": [],
            }
        for key in hit.get("altKeys", []):
            if key not in song["altKeys"]:
                song["altKeys"].append(key)
        if r.get("status", MATCHED) == MATCHED:
            song["hits"].append(hit)

        last = song["appearances"][-1] if song["appearances"] else None
        between = range(last["lastIndex"] + 1, idx) if last else range(0)
        other_song_between = any(i in hit_at and hit_at[i]["hit"]["key"] != hit["key"] for i in between)
        if last and len(between) <= 1 and not other_song_between and seg["start"] - last["end"] <= max_gap:
            last["end"] = seg["end"]
            last["lastIndex"] = idx
        else:
            song["appearances"].append({"start": seg["start"], "end": seg["end"], "lastIndex": idx})

    output = []
    for song in songs.values():
        hits = song.pop("hits")
        appearances = [{"start": a["start"], "end": a["end"]} for a in song.pop("appearances")]
        output.append({
            **song,
            "confidence": confidence(hits),
            "segmentsMatched": len(hits),
            "startTime": appearances[0]["start"],
            "endTime": appearances[0]["end"],
            "appearances": appearances,
        })
    output.sort(key=lambda s: s["startTime"])
    return output
