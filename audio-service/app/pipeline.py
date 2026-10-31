"""Phase 2 pipeline: YouTube URL -> clean audio -> list of segments ready for recognition."""

import time
from pathlib import Path

from . import audio, youtube
from .errors import AudioError


def process_video(url: str, work_dir: Path) -> dict:
    """Download, clean and segment a video's audio inside work_dir.

    The returned segments include a `path` to each WAV file. They stay on disk until the
    caller deletes work_dir, so the recognition step can read them.
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
    segments = audio.plan_segments(duration, silence)
    if not segments:
        raise AudioError("No audible sound was found in this video.", 422, "no_audio")
    lap("analyze")

    paths = audio.cut_segments(clean, segments, work_dir)
    for seg, path in zip(segments, paths):
        seg["path"] = path
    lap("split")

    timings["total"] = round(sum(timings.values()), 2)
    return {
        **info,
        "duration": duration,
        "silence": [{"start": s, "end": e} for s, e in silence],
        "segments": segments,
        "timings": timings,
    }


def public_view(result: dict) -> dict:
    """Result without local file paths, safe to send to the API."""
    return {
        **result,
        "segments": [{k: v for k, v in seg.items() if k != "path"} for seg in result["segments"]],
    }
