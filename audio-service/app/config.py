"""Settings read from environment variables (see .env.example)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


# The audio-service folder; relative paths below are resolved against it
BASE_DIR = Path(__file__).resolve().parent.parent

TEMP_DIR = (BASE_DIR / os.getenv("TEMP_DIR", "tmp")).resolve()

# Videos longer than this are rejected, to keep processing fast and free-tier friendly
MAX_DURATION_SECONDS = _int("MAX_DURATION_SECONDS", 900)

# Segments sent for recognition. Shazam fingerprints a 12 s window, so 12 s segments
# use all of the audio; longer segments would only be partly listened to.
SEGMENT_SECONDS = _float("SEGMENT_SECONDS", 12)
MIN_SEGMENT_SECONDS = _float("MIN_SEGMENT_SECONDS", 4)
MAX_SEGMENTS = _int("MAX_SEGMENTS", 75)

# Recognition. Shazam's free endpoint allows ~3 requests at once, then ~1 every 15-20 s
# per IP, so only a smart subset of segments is checked (see recognize.py).
RECOGNIZE_INITIAL_PROBES = _int("RECOGNIZE_INITIAL_PROBES", 2)  # spread across the video
# Two checks that found the same song further apart than this get a check in between
INFER_MAX_GAP_SECONDS = _float("INFER_MAX_GAP_SECONDS", 150)
# Song-change detection (see changes.py): how strong a change must be to split sections
CHANGE_THRESHOLD = _float("CHANGE_THRESHOLD", 0.8)
# Videos up to this long get one check per detected section, so every song in a montage
# Short is checked. Longer videos have too many sections (verse/chorus changes look similar).
CHECK_ALL_SECTIONS_SECONDS = _float("CHECK_ALL_SECTIONS_SECONDS", 90)
RECOGNIZE_MAX_REQUESTS = _int("RECOGNIZE_MAX_REQUESTS", 8)  # per video
RECOGNIZE_TIME_BUDGET_SECONDS = _float("RECOGNIZE_TIME_BUDGET_SECONDS", 90)  # total, waiting included
RECOGNIZE_TIMEOUT_SECONDS = _float("RECOGNIZE_TIMEOUT_SECONDS", 20)  # per Shazam request
SHAZAM_BURST = _int("SHAZAM_BURST", 3)
SHAZAM_REFILL_SECONDS = _float("SHAZAM_REFILL_SECONDS", 18)
SHAZAM_COOLDOWN_SECONDS = _float("SHAZAM_COOLDOWN_SECONDS", 30)  # pause after Shazam says "too many"
SHAZAM_MAX_RETRIES = _int("SHAZAM_MAX_RETRIES", 2)

# Silence detection: anything quieter than SILENCE_DB for at least SILENCE_MIN_SECONDS is skipped
SILENCE_DB = _int("SILENCE_DB", -40)
SILENCE_MIN_SECONDS = _float("SILENCE_MIN_SECONDS", 1.5)

# Output format for processed audio (mono 16 kHz is enough for fingerprinting)
SAMPLE_RATE = _int("SAMPLE_RATE", 16000)

# How many videos can be processed at the same time
MAX_CONCURRENT_JOBS = _int("MAX_CONCURRENT_JOBS", 2)

# yt-dlp needs a JavaScript runtime for YouTube; Node is already installed for the API
YTDLP_JS_RUNTIME = os.getenv("YTDLP_JS_RUNTIME", "node")
YTDLP_FORMAT = os.getenv("YTDLP_FORMAT", "233/234/139/249/bestaudio/best")
YTDLP_CONCURRENT_FRAGMENTS = _int("YTDLP_CONCURRENT_FRAGMENTS", 4)
# Optional cookies.txt (Netscape format) for when YouTube asks cloud servers to
# "sign in to confirm you're not a bot". Leave empty locally.
YTDLP_COOKIES_FILE = os.getenv("YTDLP_COOKIES_FILE", "")

# Shared secret: when set, every request except /health must send it in X-Service-Token.
# Set the same value as AUDIO_SERVICE_TOKEN on the Node API when deploying.
AUDIO_SERVICE_TOKEN = os.getenv("AUDIO_SERVICE_TOKEN", "")
