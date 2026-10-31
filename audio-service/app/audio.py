"""Audio processing with FFmpeg: clean-up, silence detection and segmentation."""

import logging
import re
import shutil
import subprocess
from pathlib import Path

from . import config
from .errors import AudioError

log = logging.getLogger("audio-service.ffmpeg")

# Light clean-up: downmix + resample early (much faster), cut low rumble, then even out
# loudness so quiet background music is easier to recognize. dynaudnorm is ~20x faster than loudnorm.
CLEAN_FILTER = (
    f"aformat=channel_layouts=mono,aresample={config.SAMPLE_RATE},"
    "highpass=f=60,dynaudnorm=f=250:g=15"
)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(cmd: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as err:
        raise AudioError("FFmpeg is not installed on the server.", 500, "ffmpeg_missing") from err
    except subprocess.TimeoutExpired as err:
        raise AudioError("Audio processing took too long.", 504, "ffmpeg_timeout") from err
    if result.returncode != 0:
        log.error("%s exited with %s\n%s", " ".join(cmd), result.returncode, result.stderr.strip()[-2000:])
        tail = result.stderr.strip().splitlines()[-1:] or [f"exit code {result.returncode}"]
        raise AudioError(f"Audio processing failed: {tail[0]}", 500, "ffmpeg_failed")
    return result


def to_clean_wav(src: Path, dest: Path) -> Path:
    """Convert any input to mono 16-bit WAV at SAMPLE_RATE, with the clean-up filter applied."""
    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-vn", "-af", CLEAN_FILTER,
        "-ac", "1", "-ar", str(config.SAMPLE_RATE), "-c:a", "pcm_s16le",
        str(dest),
    ])
    return dest


def get_duration(path: Path) -> float:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ])
    try:
        return round(float(result.stdout.strip()), 2)
    except ValueError as err:
        raise AudioError("Couldn't read the audio duration.", 500, "ffprobe_failed") from err


_SILENCE_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
_SILENCE_END = re.compile(r"silence_end:\s*([\d.]+)")


def parse_silence(stderr: str, duration: float) -> list[tuple[float, float]]:
    """Turn FFmpeg silencedetect output into a list of (start, end) silent ranges."""
    ranges, start = [], None
    for line in stderr.splitlines():
        if (m := _SILENCE_START.search(line)):
            start = max(0.0, float(m.group(1)))
        elif (m := _SILENCE_END.search(line)) and start is not None:
            ranges.append((round(start, 2), round(float(m.group(1)), 2)))
            start = None
    if start is not None:  # silence runs to the end of the file
        ranges.append((round(start, 2), duration))
    return ranges


def detect_silence(path: Path, duration: float) -> list[tuple[float, float]]:
    result = _run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"silencedetect=noise={config.SILENCE_DB}dB:d={config.SILENCE_MIN_SECONDS}",
        "-f", "null", "-",
    ])
    return parse_silence(result.stderr, duration)


def sound_ranges(duration: float, silence: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """The parts of the audio that are not silent."""
    ranges, cursor = [], 0.0
    for s_start, s_end in sorted(silence):
        if s_start > cursor:
            ranges.append((cursor, s_start))
        cursor = max(cursor, s_end)
    if cursor < duration:
        ranges.append((cursor, duration))
    return ranges


def plan_segments(
    duration: float,
    silence: list[tuple[float, float]],
    segment_seconds: float | None = None,
    min_seconds: float | None = None,
    max_segments: int | None = None,
) -> list[dict]:
    """Split the non-silent audio into fixed-length windows.

    A short leftover at the end of a range is kept only if it is at least min_seconds long.
    If there are more windows than max_segments, they are thinned out evenly across the video.
    """
    seg = segment_seconds or config.SEGMENT_SECONDS
    min_len = min_seconds or config.MIN_SEGMENT_SECONDS
    limit = max_segments or config.MAX_SEGMENTS

    windows = []
    for r_start, r_end in sound_ranges(duration, silence):
        t = r_start
        while r_end - t >= min_len:
            end = min(t + seg, r_end)
            windows.append((round(t, 2), round(end, 2)))
            t = end

    if len(windows) > limit:
        step = len(windows) / limit
        windows = [windows[int(i * step)] for i in range(limit)]

    return [{"index": i, "start": s, "end": e} for i, (s, e) in enumerate(windows)]


def cut_segments(src: Path, segments: list[dict], out_dir: Path) -> list[Path]:
    """Write each planned segment to its own WAV file."""
    paths = []
    for seg in segments:
        dest = out_dir / f"segment_{seg['index']:03d}.wav"
        _run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(seg["start"]), "-t", str(round(seg["end"] - seg["start"], 2)),
            "-i", str(src), "-c", "copy", str(dest),
        ], timeout=60)
        paths.append(dest)
    return paths
