"""Sound2Song audio service: downloads YouTube audio, processes it with FFmpeg
and (from Phase 3) recognizes the songs in it."""

import asyncio
import logging
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import audio, config
from .errors import AudioError
from .pipeline import process_video, public_view

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


@app.exception_handler(AudioError)
async def audio_error_handler(_: Request, err: AudioError):
    return JSONResponse(status_code=err.status_code, content={"code": err.code, "message": err.message})


class ProcessRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=500)


@app.get("/health")
def health():
    return {"status": "ok", "ffmpeg": audio.ffmpeg_available()}


@app.post("/process")
async def process(body: ProcessRequest):
    """Download and prepare a video's audio, returning metadata and the segment plan.
    Temporary files are deleted before responding."""
    async with _jobs:
        work_dir = Path(tempfile.mkdtemp(prefix="job_", dir=config.TEMP_DIR))
        try:
            result = await run_in_threadpool(process_video, body.url, work_dir)
            log.info("Processed %s: %d segments in %ss", result["videoId"], len(result["segments"]), result["timings"]["total"])
            return public_view(result)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)
