# Sound2Song audio service: FastAPI + yt-dlp + FFmpeg + shazamio
FROM python:3.13-slim

# FFmpeg for audio processing
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp needs a JavaScript runtime for YouTube; Deno is a single small binary
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1 \
    YTDLP_JS_RUNTIME=deno \
    TEMP_DIR=/tmp/sound2song

# Run as a non-root user
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
# Hosting platforms (Render, Railway, Fly) pass the port in $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
