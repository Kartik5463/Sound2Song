"""Sound2Song audio service: downloads YouTube audio, processes it with FFmpeg
and recognizes the songs in it."""

import asyncio
import hmac
import logging
import shutil
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import audio, config
from .errors import AudioError
from .pipeline import process_upload, process_video, public_view
from .alternatives import add_alternatives
from .links import add_links
from .recognize import merge_results, recognize_segments

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("audio-service")

_jobs = asyncio.Semaphore(config.MAX_CONCURRENT_JOBS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Remove leftovers from a previous crash, then make sure the temp folder exists
    shutil.rmtree(config.TEMP_DIR, ignore_errors=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    if not audio.ffmpeg_available():
        log.warning("FFmpeg/ffprobe not found on PATH - audio processing will fail")
    yield


app = FastAPI(title="Sound2Song Audio Service", lifespan=lifespan)


@app.middleware("http")
async def require_token(request: Request, call_next):
    """Only the Node API may use this service when AUDIO_SERVICE_TOKEN is set."""
    token = config.AUDIO_SERVICE_TOKEN
    if token and request.url.path != "/health":
        sent = request.headers.get("x-service-token", "")
        if not hmac.compare_digest(sent, token):
            return JSONResponse(status_code=401, content={"code": "unauthorized", "message": "Unauthorized."})
    return await call_next(request)


@app.exception_handler(AudioError)
async def audio_error_handler(_: Request, err: AudioError):
    return JSONResponse(status_code=err.status_code, content={"code": err.code, "message": err.message})


class ProcessRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=500)


@app.get("/health")
def health():
    return {"status": "ok", "ffmpeg": audio.ffmpeg_available()}


class _Job:
    """A temp folder for one request, removed afterwards. Also limits parallel jobs."""

    async def __aenter__(self) -> Path:
        await _jobs.acquire()
        self.dir = Path(tempfile.mkdtemp(prefix="job_", dir=config.TEMP_DIR))
        return self.dir

    async def __aexit__(self, *exc):
        shutil.rmtree(self.dir, ignore_errors=True)
        _jobs.release()


@app.post("/process")
async def process(body: ProcessRequest):
    """Download and prepare a video's audio, returning metadata and the segment plan
    (no recognition). Useful for debugging the audio pipeline."""
    async with _Job() as work_dir:
        result = await run_in_threadpool(process_video, body.url, work_dir)
        return public_view(result)


async def _recognize(result: dict) -> dict:
    """Recognize the prepared segments, merge them into songs and add alternatives."""
    started = time.perf_counter()
    per_segment = await recognize_segments(result["segments"], result["audioPath"])
    songs = merge_results(result["segments"], per_segment)
    try:
        await add_alternatives(songs)
    except Exception as err:  # extra info only
        log.warning("Alternative lookup failed: %r", err)
        for song in songs:
            song.pop("altKeys", None)
            song.setdefault("alsoMatches", [])
            song.setdefault("mashup", None)
    try:
        await add_links(songs)  # official YouTube video + legal free downloads
    except Exception as err:  # extra info only
        log.warning("Link lookup failed: %r", err)
    result["timings"]["recognize"] = round(time.perf_counter() - started, 2)
    result["timings"]["total"] = round(result["timings"]["total"] + result["timings"]["recognize"], 2)

    # Tag each segment with what was found in it, for the timeline in the UI
    outcome = {r["index"]: r for r in per_segment}
    for seg in result["segments"]:
        r = outcome[seg["index"]]
        seg["songKey"] = r["hit"]["key"] if r["hit"] else None
        seg["status"] = r["status"]

    log.info(
        "Identified %s: %d song(s) from %d segments in %ss",
        result.get("videoId") or result["title"], len(songs), len(result["segments"]), result["timings"]["total"],
    )
    return {**public_view(result), "songs": songs}


@app.post("/identify")
async def identify(body: ProcessRequest):
    """Full pipeline for a YouTube URL: download, clean, split, recognize and merge.
    Temporary files are deleted before responding."""
    async with _Job() as work_dir:
        result = await run_in_threadpool(process_video, body.url, work_dir)
        return await _recognize(result)


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    """Stream an upload to disk, refusing files over MAX_UPLOAD_MB."""
    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with dest.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise AudioError(f"This file is too big. The limit is {config.MAX_UPLOAD_MB} MB.", 413, "file_too_big")
            out.write(chunk)
    if size == 0:
        raise AudioError("The uploaded file is empty.", 400, "empty_file")


@app.post("/identify-file")
async def identify_file(file: UploadFile = File(...), name: str = Form("")):
    """Full pipeline for an uploaded audio or video file. The file is deleted afterwards."""
    async with _Job() as work_dir:
        suffix = Path(file.filename or "").suffix.lower()[:10]
        path = work_dir / f"upload{suffix if suffix.isascii() else ''}"
        await _save_upload(file, path)
        display_name = (name or file.filename or "Uploaded file").strip()[:200]
        result = await run_in_threadpool(process_upload, path, work_dir, display_name)
        return await _recognize(result)
