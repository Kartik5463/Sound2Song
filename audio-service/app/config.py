"""Settings read from environment variables (see .env.example)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


TEMP_DIR = Path(os.getenv("TEMP_DIR", "./tmp")).resolve()

# Videos longer than this are rejected, to keep processing fast and free-tier friendly
MAX_DURATION_SECONDS = _int("MAX_DURATION_SECONDS", 900)

# Segments sent for recognition
SEGMENT_SECONDS = _float("SEGMENT_SECONDS", 20)
MIN_SEGMENT_SECONDS = _float("MIN_SEGMENT_SECONDS", 6)
MAX_SEGMENTS = _int("MAX_SEGMENTS", 60)

# Silence detection: anything quieter than SILENCE_DB for at least SILENCE_MIN_SECONDS is skipped
SILENCE_DB = _int("SILENCE_DB", -40)
SILENCE_MIN_SECONDS = _float("SILENCE_MIN_SECONDS", 1.5)

# Output format for processed audio (mono 16 kHz is enough for fingerprinting)
SAMPLE_RATE = _int("SAMPLE_RATE", 16000)

# How many videos can be processed at the same time
MAX_CONCURRENT_JOBS = _int("MAX_CONCURRENT_JOBS", 2)

# yt-dlp needs a JavaScript runtime for YouTube; Node is already installed for the API
YTDLP_JS_RUNTIME = os.getenv("YTDLP_JS_RUNTIME", "node")
