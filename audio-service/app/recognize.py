"""Song recognition (Phase 3).

Shazam's free endpoint (via shazamio) allows only about 3 requests in a burst and then
roughly one every 15-20 seconds per IP address. Checking every 12 s segment of a video
would take minutes, so instead we check a few segments and spend more requests only
where it helps:

1. Check a few segments spread evenly across the video.
2. If two checked segments found the same song, everything between them is that song.
3. If they found different results, check the middle segment to narrow down where one
   song ends and the next begins, until the request budget runs out.
4. If nothing was found yet, check the biggest unchecked gaps instead.

A shared rate limiter spaces requests out so they wait instead of being rejected.
"""

import asyncio
import logging
import math
import time

from aiohttp_retry import ExponentialRetry
from shazamio import Shazam
from shazamio.client import HTTPClient
from shazamio.exceptions import RateLimited

from . import config
from .errors import AudioError

log = logging.getLogger("audio-service.recognize")

# A match whose time/frequency skew is above this is less trustworthy. shazamio measured that
# 1e-3 rejects most wrong answers while keeping ~97% of right ones. We don't drop these hits
# (sped-up or pitch-shifted edits legitimately have skew); we just give them less weight.
CLEAN_SKEW = 1e-3

# How much one checked segment contributes to confidence: a clean hit 0.75, a skewed hit 0.45
CLEAN_HIT_WEIGHT = 0.75
SKEWED_HIT_WEIGHT = 0.45

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


def next_probe(n: int, checked: dict[int, dict]) -> int | None:
    """Pick the next segment worth checking, or None if more checks wouldn't help.

    Priority 1: the middle of the widest unchecked gap between two checks that disagree
    (a song boundary is somewhere in there). Gaps at the start/end of the video are not
    refined: each extra request costs ~18 s, and the initial checks are spread so that
    edges are already close to a check.
    Priority 2 (only while no song has been found): the middle of the widest unchecked
    gap anywhere, including the edges.
    """
    if len(checked) >= n:
        return None
    positions = sorted(checked)
    gaps = []  # (width, start, end) of unchecked runs, with whether the sides disagree
    bounds = [-1, *positions, n]
    for a, b in zip(bounds, bounds[1:]):
        if b - a <= 1:
            continue
        at_edge = a < 0 or b >= n
        disagree = not at_edge and _outcome(checked[a]) != _outcome(checked[b])
        gaps.append((b - a - 1, a, b, disagree))

    boundary_gaps = [g for g in gaps if g[3]]
    if boundary_gaps:
        _, a, b, _ = max(boundary_gaps)
    elif gaps and not any(r["hit"] for r in checked.values()):
        _, a, b, _ = max(gaps)
    else:
        return None
    # The unchecked positions are a+1 .. b-1 (a may be -1, b may be n); take the middle one
    return (a + b) // 2


def fill_in(n: int, checked: dict[int, dict]) -> list[dict]:
    """Final status for every segment. Unchecked runs between two checks of the same song
    are 'inferred' to be that song; everything else unchecked is 'skipped'."""
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
        if ka is not None and ka not in (FAILED, SKIPPED) and ka == kb:
            for i in range(a + 1, b):
                out[i] = {"index": i, "hit": checked[a]["hit"], "error": None, "status": INFERRED}
    return out


# ---------- Calling Shazam ----------

async def _check(shazam: Shazam, segment: dict, deadline: float) -> dict:
    """Recognize one segment, waiting for the rate limiter and retrying if Shazam pushes back.
    Gives up (error "RateLimited") rather than wait past the deadline."""
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
                shazam.recognize(str(segment["path"])), timeout=config.RECOGNIZE_TIMEOUT_SECONDS
            )
            return {"hit": parse_answer(answer), "error": None}
        except RateLimited:
            log.info("Rate limited by Shazam, pausing %ss", config.SHAZAM_COOLDOWN_SECONDS)
            limiter().penalize(config.SHAZAM_COOLDOWN_SECONDS)
        except Exception as err:  # one bad segment shouldn't sink the whole video
            log.warning("Segment %s failed: %r", segment["index"], err)
            return {"hit": None, "error": type(err).__name__}
    return {"hit": None, "error": "RateLimited"}


async def recognize_segments(segments: list[dict]) -> list[dict]:
    """Check a smart subset of segments. Returns one entry per segment, in order, with a
    status of matched / inferred / no_match / skipped / failed."""
    n = len(segments)
    if n == 0:
        return []

    checked: dict[int, dict] = {}
    started = time.monotonic()
    # Everything (waiting for the rate limiter included) must finish by this time
    deadline = started + config.RECOGNIZE_TIME_BUDGET_SECONDS
    # Our own limiter handles pacing, so turn off shazamio's long built-in retry loop
    client = HTTPClient(retry_options=ExponentialRetry(attempts=1))
    try:
        async with Shazam(http_client=client) as shazam:
            # About one check per 90 s of audio (at least RECOGNIZE_INITIAL_PROBES, at most 6)
            span = segments[-1]["end"] - segments[0]["start"]
            k = min(max(config.RECOGNIZE_INITIAL_PROBES, math.ceil(span / 90)), 6, config.RECOGNIZE_MAX_REQUESTS)
            for pos in initial_probes(n, k):
                if time.monotonic() >= deadline:
                    break
                checked[pos] = await _check(shazam, segments[pos], deadline)

            while len(checked) < config.RECOGNIZE_MAX_REQUESTS and time.monotonic() < deadline:
                pos = next_probe(n, checked)
                if pos is None or pos in checked:
                    break
                checked[pos] = await _check(shazam, segments[pos], deadline)
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
    return fill_in(n, checked)


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
                **{k: v for k, v in hit.items() if k not in ("offset", "skew")},
                "hits": [],
                "appearances": [],
            }
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
