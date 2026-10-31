"""YouTube helpers: URL parsing, metadata lookup and audio download (yt-dlp)."""

import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from . import config
from .errors import AudioError

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YT_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"}


def extract_video_id(url: str) -> str | None:
    """Return the 11-character video ID from any common YouTube URL, or None."""
    if not url:
        return None
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host not in _YT_HOSTS:
        return None

    candidate = None
    parts = [p for p in parsed.path.split("/") if p]
    if host == "youtu.be":
        candidate = parts[0] if parts else None
    elif parts and parts[0] in ("shorts", "embed", "live", "v"):
        candidate = parts[1] if len(parts) > 1 else None
    else:
        candidate = parse_qs(parsed.query).get("v", [None])[0]

    return candidate if candidate and _ID_RE.match(candidate) else None


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _ydl_opts(**extra) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "noprogress": True,
        "js_runtimes": {config.YTDLP_JS_RUNTIME: {}},
        **extra,
    }


def _friendly_error(err: DownloadError) -> AudioError:
    msg = str(err).lower()
    if "private" in msg:
        return AudioError("This video is private.", 403, "video_private")
    if "confirm your age" in msg or ("age" in msg and "restricted" in msg):
        return AudioError("This video is age-restricted and can't be processed.", 403, "age_restricted")
    if "unavailable" in msg or "not available" in msg or "removed" in msg:
        return AudioError("This video is unavailable.", 404, "video_unavailable")
    return AudioError("Couldn't download this video from YouTube.", 502, "download_failed")


def _check_info(info: dict) -> None:
    """Reject live streams and videos over the length limit before downloading."""
    if info.get("is_live"):
        raise AudioError("Live streams can't be processed yet. Try again once the stream has ended.", 422, "live_stream")
    if (info.get("duration") or 0) > config.MAX_DURATION_SECONDS:
        limit = config.MAX_DURATION_SECONDS // 60
        raise AudioError(f"Video is too long. The limit is {limit} minutes.", 422, "too_long")


def summarize(info: dict) -> dict:
    """The few metadata fields the app needs."""
    return {
        "videoId": info.get("id"),
        "title": info.get("title"),
        "channel": info.get("channel") or info.get("uploader"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration") or 0,
    }


def download_audio(video_id: str, out_dir: Path) -> tuple[dict, Path]:
    """Look up the video, check it, then download its best audio-only stream into out_dir.

    Both steps use the same yt-dlp session: YouTube's stream links are tied to the session
    that fetched them, so reusing info in a new session fails with 403.
    Returns (metadata summary, path to the downloaded file).
    """
    opts = _ydl_opts(
        format="bestaudio/best",
        outtmpl=str(out_dir / "source.%(ext)s"),
        max_filesize=200 * 1024 * 1024,
    )
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(watch_url(video_id), download=False)
            _check_info(info)
            ydl.process_ie_result(info, download=True)
    except DownloadError as err:
        raise _friendly_error(err) from err

    files = list(out_dir.glob("source.*"))
    if not files:
        raise AudioError("Audio download produced no file.", 502, "download_failed")
    return summarize(info), files[0]
