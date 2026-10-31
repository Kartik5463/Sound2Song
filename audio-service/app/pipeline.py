"""Audio pipeline: YouTube URL -> clean audio -> plan of segments ready for recognition."""

import logging
import time
from pathlib import Path

from . import audio, changes, config, youtube
from .errors import AudioError

log = logging.getLogger("audio-service.pipeline")


def process_video(url: str, work_dir: Path) -> dict:
    """Download, clean and segment a video's audio inside work_dir.

    Segments are only planned here (start/end times). The recognition step reads the
    ones it checks straight from `audioPath` (the cleaned WAV), which stays on disk
    until the caller deletes work_dir.
    """
    timings = {}
    clock = time.perf_counter()

    def lap(name: str):
        nonlocal clock
        now = time.perf_counter()
        timings[name] = round(now - clock, 2)
        clock = now

    video_id = youtube.extract_video_id(url)
    if not video_id:
        raise AudioError("That doesn't look like a valid YouTube video URL.", 400, "invalid_url")

    info, source = youtube.download_audio(video_id, work_dir)
    lap("download")

    clean = audio.to_clean_wav(source, work_dir / "clean.wav")
    source.unlink(missing_ok=True)
    duration = audio.get_duration(clean)
    lap("convert")

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
        raise AudioError("No audible sound was found in this video.", 422, "no_audio")
    lap("analyze")

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


def public_view(result: dict) -> dict:
    """Result without local file paths, safe to send to the API."""
    return {k: v for k, v in result.items() if k != "audioPath"}
