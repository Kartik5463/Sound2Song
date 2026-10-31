"""Audio pipeline: YouTube URL or uploaded file -> clean audio -> plan of segments ready
for recognition."""

import logging
import time
from pathlib import Path

from . import audio, changes, config, youtube
from .errors import AudioError

log = logging.getLogger("audio-service.pipeline")


class _Timer:
    """Records how long each step takes."""

    def __init__(self):
        self.timings: dict[str, float] = {}
        self._clock = time.perf_counter()

    def lap(self, name: str) -> None:
        now = time.perf_counter()
        self.timings[name] = round(now - self._clock, 2)
        self._clock = now


def _prepare(source: Path, work_dir: Path, info: dict, timer: _Timer) -> dict:
    """Shared steps after the audio is on disk: clean it up, find silence and song changes,
    and plan the segments.

    Segments are only planned here (start/end times). The recognition step reads the
    ones it checks straight from `audioPath` (the cleaned WAV), which stays on disk
    until the caller deletes work_dir.
    """
    clean = audio.to_clean_wav(source, work_dir / "clean.wav")
    source.unlink(missing_ok=True)
    duration = audio.get_duration(clean)
    timer.lap("convert")

    silence = audio.detect_silence(clean, duration)
    try:
        song_changes = changes.detect_changes(
            clean, audio.sound_ranges(duration, silence), threshold=config.CHANGE_THRESHOLD
        )
    except Exception as err:  # detection only improves accuracy; never fail the request over it
        log.warning("Song-change detection failed: %r", err)
        song_changes = []
    segments = audio.plan_segments(duration, silence, cuts=[t for t, _ in song_changes])
    if not segments:
        raise AudioError("No audible sound was found in this audio.", 422, "no_audio")
    timer.lap("analyze")

    timings = dict(timer.timings)
    timings["total"] = round(sum(timings.values()), 2)
    return {
        **info,
        "duration": duration,
        "silence": [{"start": s, "end": e} for s, e in silence],
        "changes": [{"time": t, "strength": st} for t, st in song_changes],
        "segments": segments,
        "timings": timings,
        "audioPath": clean,
    }


def process_video(url: str, work_dir: Path) -> dict:
    """Download a YouTube video's audio into work_dir and prepare it for recognition."""
    timer = _Timer()
    video_id = youtube.extract_video_id(url)
    if not video_id:
        raise AudioError("That doesn't look like a valid YouTube video URL.", 400, "invalid_url")

    info, source = youtube.download_audio(video_id, work_dir)
    timer.lap("download")
    return _prepare(source, work_dir, {**info, "source": "youtube"}, timer)


def process_upload(path: Path, work_dir: Path, name: str) -> dict:
    """Prepare an uploaded audio or video file (already saved in work_dir) for recognition."""
    timer = _Timer()
    has_audio, duration = audio.probe_file(path)
    if not has_audio:
        raise AudioError("This file has no audio track, or it isn't an audio/video file.", 422, "no_audio_track")
    if duration > config.MAX_DURATION_SECONDS:
        limit = config.MAX_DURATION_SECONDS // 60
        raise AudioError(f"This file is too long. The limit is {limit} minutes.", 422, "too_long")
    timer.lap("upload")

    info = {"videoId": None, "title": name or "Uploaded file", "channel": None, "thumbnail": None,
            "source": "upload"}
    return _prepare(path, work_dir, info, timer)


def public_view(result: dict) -> dict:
    """Result without local file paths, safe to send to the API."""
    return {k: v for k, v in result.items() if k != "audioPath"}
