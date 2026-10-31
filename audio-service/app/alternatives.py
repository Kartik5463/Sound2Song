"""Other catalogue tracks that match the same audio, and mashup detection.

Shazam's answer lists every catalogue track whose fingerprint matched, not just the best
one: other versions, covers, remixes and, for mashups, the mashup itself (for example
"Darkside X Aja Sanam (Remix)"). We look those up (a different Shazam endpoint from
recognition) and, when one of them is a mashup, split its title into the songs it
combines. Those parts are known by name only, so the UI links to a search for them
instead of claiming a specific recording.
"""

import asyncio
import logging
import re

from shazamio import Shazam

log = logging.getLogger("audio-service.alternatives")

MAX_LOOKUPS_PER_SONG = 3
LOOKUP_TIMEOUT_SECONDS = 5

# "A x B", "A X B", "A × B", "A vs B", "A + B", "A / B"
_JOIN = re.compile(r"\s+(?:x|×|vs\.?|\+|/)\s+", re.IGNORECASE)
_NOISE = re.compile(
    r"\((?:[^)]*\b(?:remix|mashup|mash up|edit|mix|version|lofi|slowed|reverb|sped up)\b[^)]*)\)"
    r"|\[[^\]]*\]|\b(?:mash ?up|medley|remix)\b",
    re.IGNORECASE,
)


def _clean(part: str) -> str:
    part = _NOISE.sub("", part)
    return re.sub(r"\s{2,}", " ", part).strip(" -–|:,")


def _norm(text: str) -> str:
    return re.sub(r"[^\w]+", " ", (text or "").lower()).strip()


def _same_title(a: str, b: str) -> bool:
    a, b = _norm(a), _norm(b)
    return bool(a and b) and (a == b or a in b or b in a)


def mashup_parts(title: str) -> list[str]:
    """Song names in a mashup title like "Darkside X Aja Sanam (Remix)", or [] if it
    doesn't look like a mashup."""
    if not title:
        return []
    parts = [_clean(p) for p in _JOIN.split(title)]
    parts = [p for p in parts if p]
    if len(parts) >= 2:
        return parts
    return []


def _summary(track: dict) -> dict:
    images = track.get("images") or {}
    return {
        "key": str(track.get("key")),
        "title": track.get("title"),
        "artist": track.get("subtitle"),
        "coverUrl": images.get("coverart") or images.get("coverarthq"),
        "shazamUrl": track.get("url"),
    }


async def _about(shazam: Shazam, key: str) -> dict | None:
    try:
        track = await asyncio.wait_for(shazam.track_about(track_id=int(key)), LOOKUP_TIMEOUT_SECONDS)
        return _summary(track) if track and track.get("title") else None
    except Exception as err:  # extra info only; never fail the request over it
        log.info("Lookup of track %s failed: %r", key, err)
        return None


def build_mashup(song: dict, also: list[dict], found_titles: list[str]) -> dict | None:
    """If the song itself or one of its alternatives is a mashup, describe it."""
    candidates = [{"title": song["title"], "artist": song["artist"], "key": song["key"],
                   "shazamUrl": song.get("shazamUrl"), "coverUrl": song.get("coverUrl")}, *also]
    for track in candidates:
        parts = mashup_parts(track["title"])
        if len(parts) < 2:
            continue
        # A mashup must include the song we actually heard
        if not any(_same_title(p, song["title"]) for p in parts):
            continue
        return {
            **track,
            "parts": [{"name": p, "identified": any(_same_title(p, t) for t in found_titles)} for p in parts],
        }
    return None


async def add_alternatives(songs: list[dict]) -> None:
    """Fill in `alsoMatches` and `mashup` on each song (in place). Each song may carry
    `altKeys` (other matching track ids from its hits); it is removed afterwards."""
    found_titles = [s["title"] for s in songs]
    async with Shazam() as shazam:
        for song in songs:
            keys = [k for k in song.pop("altKeys", []) if k != song["key"]][:MAX_LOOKUPS_PER_SONG]
            looked_up = await asyncio.gather(*(_about(shazam, k) for k in keys)) if keys else []
            also = [
                t for t in looked_up
                if t and not (_same_title(t["title"], song["title"]) and _norm(t["artist"]) == _norm(song["artist"]))
            ]
            song["alsoMatches"] = also
            song["mashup"] = build_mashup(song, also, found_titles)
