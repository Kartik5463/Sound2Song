"""Where to watch or legally get an identified song.

- Official YouTube video: first from MusicBrainz (community-curated links for the exact
  recording, looked up by ISRC), otherwise by searching YouTube with yt-dlp and ranking
  the results (artist / label channel, title match, "official" wording, length...).
  Only a strong match is labelled official; anything else is a "best match".
- Free download: only links MusicBrainz editors have marked "download for free" (often an
  artist's own Bandcamp page). We never guess: no curated link means no button.

All free, no API keys. MusicBrainz asks for at most 1 request per second and a
User-Agent identifying the app, see https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
"""

import asyncio
import logging
import math
import re
import time
from urllib.parse import urlparse

import aiohttp
from yt_dlp import YoutubeDL

from . import config
from .alternatives import _norm, _same_title

log = logging.getLogger("audio-service.links")

MB_URL = "https://musicbrainz.org/ws/2/isrc/{isrc}"
TIMEOUT_SECONDS = 8

# ---------- MusicBrainz ----------

_mb_lock = asyncio.Lock()
_mb_last = 0.0


async def _mb_wait() -> None:
    """Keep to MusicBrainz's limit of one request per second (shared by all requests)."""
    global _mb_last
    async with _mb_lock:
        delay = _mb_last + 1.1 - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
        _mb_last = time.monotonic()


def _is_youtube_video(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ("www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be")


SITE_NAMES = {
    "bandcamp.com": "Bandcamp",
    "soundcloud.com": "SoundCloud",
    "archive.org": "Internet Archive",
    "freemusicarchive.org": "Free Music Archive",
    "jamendo.com": "Jamendo",
    "audiomack.com": "Audiomack",
}


def site_name(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for domain, name in SITE_NAMES.items():
        if host == domain or host.endswith("." + domain):
            return name
    return host


def parse_musicbrainz(data: dict, title: str) -> dict:
    """Pick the official YouTube link and any free downloads from an ISRC lookup.
    Recordings whose title doesn't match ours are ignored (ISRC data has mistakes)."""
    relations = []
    for rec in data.get("recordings") or []:
        if _same_title(rec.get("title", ""), title):
            relations.extend(rec.get("relations") or [])

    youtube = None
    free = []
    for rel in relations:
        url = ((rel.get("url") or {}).get("resource") or "").strip()
        if not url.startswith("http"):
            continue
        kind = rel.get("type")
        if kind in ("free streaming", "streaming") and _is_youtube_video(url) and not youtube:
            youtube = url
        elif kind == "download for free" and url not in [f["url"] for f in free]:
            free.append({"url": url, "site": site_name(url)})
    return {"youtube": youtube, "freeDownloads": free}


async def musicbrainz_links(session: aiohttp.ClientSession, isrc: str | None, title: str) -> dict:
    if not isrc:
        return {"youtube": None, "freeDownloads": []}
    await _mb_wait()
    try:
        async with session.get(MB_URL.format(isrc=isrc), params={"inc": "url-rels", "fmt": "json"}) as res:
            if res.status != 200:
                return {"youtube": None, "freeDownloads": []}
            return parse_musicbrainz(await res.json(), title)
    except Exception as err:
        log.info("MusicBrainz lookup failed for %s: %r", isrc, err)
        return {"youtube": None, "freeDownloads": []}


# ---------- YouTube search ----------

_OFFICIAL_VIDEO = re.compile(r"official\s+(music\s+)?video|\bm\s*/\s*v\b|\bmv\b", re.I)
_OFFICIAL_OTHER = re.compile(r"official\s+(audio|lyric video|visualizer)", re.I)
_LYRICS = re.compile(r"\blyrics?\b", re.I)
_UNWANTED = re.compile(
    r"\b(cover|remix|live|concert|reaction|react|8d|karaoke|instrumental|nightcore|sped up|slowed|"
    r"reverb|1 hour|hour loop|fan ?made|ai[- ]enhanced|tutorial|dance practice|shorts?)\b",
    re.I,
)


def _channel_matches(channel: str, names: list[str]) -> bool:
    ch = _norm(channel).replace(" ", "")
    for name in names:
        n = _norm(name).replace(" ", "")
        if n and (ch == n or ch in (n + "vevo", n + "topic", "official" + n, n + "official", n + "music")):
            return True
        if n and len(n) >= 4 and n in ch:
            return True
    return False


def score_video(entry: dict, title: str, artist: str, label: str | None, duration_s: float | None) -> tuple[float, bool]:
    """Score one search result; returns (score, looks official)."""
    v_title = entry.get("title") or ""
    channel = entry.get("channel") or entry.get("uploader") or ""
    base_title = re.sub(r"\(.*?\)|\[.*?\]", "", title).strip() or title
    # Words in the song's own title (e.g. "Slowed") must not count against a result
    own_words = _norm(title)

    channel_ok = _channel_matches(channel, [artist] + ([label] if label else []))
    title_ok = _same_title(base_title, v_title) or _norm(base_title) in _norm(v_title)

    score = 0.0
    score += 5 if channel_ok else 0
    score += 1 if entry.get("channel_is_verified") else 0
    score += 3 if title_ok else -4
    score += 1 if _norm(artist) and _norm(artist) in _norm(v_title) else 0
    if _OFFICIAL_VIDEO.search(v_title):
        score += 3
    elif _OFFICIAL_OTHER.search(v_title):
        score += 1
    elif _LYRICS.search(v_title):
        score -= 3
    unwanted = [w.lower() for w in _UNWANTED.findall(v_title) if w.lower() not in own_words]
    score -= 4 * len(unwanted)
    if duration_s and entry.get("duration"):
        diff = abs(entry["duration"] - duration_s)
        score += 1 if diff <= 30 else (-1 if diff > 90 else 0)
    if entry.get("view_count"):
        score += min(2.0, math.log10(entry["view_count"] + 1) / 5)

    official = channel_ok and title_ok and not unwanted
    return score, official


def _search_youtube(title: str, artist: str) -> list[dict]:
    opts = {"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch8:{artist} {title} official video", download=False)
    return [e for e in info.get("entries") or [] if e.get("id")]


def best_video(entries: list[dict], title: str, artist: str, label: str | None, duration_s: float | None) -> dict | None:
    scored = [(score_video(e, title, artist, label, duration_s), e) for e in entries]
    scored = [x for x in scored if x[0][0] > 0]
    if not scored:
        return None
    (score, official), e = max(scored, key=lambda x: x[0][0])
    return {
        "url": f"https://www.youtube.com/watch?v={e['id']}",
        "title": e.get("title"),
        "channel": e.get("channel") or e.get("uploader"),
        "official": official,
        "source": "search",
    }


async def youtube_video(song: dict) -> dict | None:
    try:
        entries = await asyncio.to_thread(_search_youtube, song["title"], song.get("artist") or "")
    except Exception as err:
        log.info("YouTube search failed for %s: %r", song["title"], err)
        return None
    duration = (song.get("durationMs") or 0) / 1000 or None
    return best_video(entries, song["title"], song.get("artist") or "", song.get("label"), duration)


# ---------- Putting it together ----------

async def _links_for(session: aiohttp.ClientSession, song: dict) -> None:
    mb = await musicbrainz_links(session, song.get("isrc"), song["title"])
    song["freeDownloads"] = mb["freeDownloads"]
    if mb["youtube"]:
        song["officialVideo"] = {"url": mb["youtube"], "title": None, "channel": None,
                                 "official": True, "source": "musicbrainz"}
    else:
        song["officialVideo"] = await youtube_video(song)


async def add_links(songs: list[dict]) -> None:
    """Fill in `officialVideo` and `freeDownloads` on each song (in place). Never raises."""
    for song in songs:
        song.setdefault("officialVideo", None)
        song.setdefault("freeDownloads", [])
    if not songs:
        return
    headers = {"User-Agent": config.MUSICBRAINZ_USER_AGENT, "Accept": "application/json"}
    timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
            await asyncio.wait_for(
                asyncio.gather(*(_links_for(session, s) for s in songs)), timeout=TIMEOUT_SECONDS * 2
            )
    except Exception as err:  # extra info only; keep whatever was found
        log.warning("Link lookup incomplete: %r", err)
