# Sound2Song audio service: FastAPI + yt-dlp + FFmpeg + shazamio
# plus a PO token server, so YouTube treats downloads more like a real browser.

# Official pre-built PO token server (bgutil-ytdlp-pot-provider), Deno flavour, pinned.
# Keep this version in step with bgutil-ytdlp-pot-provider in requirements.txt.
FROM brainicism/bgutil-ytdlp-pot-provider:2.0.2-deno AS pot

FROM python:3.13-slim

# FFmpeg for audio processing
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Deno runs the token server and is also yt-dlp's JavaScript runtime for YouTube
COPY --from=pot /usr/bin/deno /usr/local/bin/deno

# Run as a non-root user
RUN useradd --create-home appuser

# The token server stays at the same path as in its official image, so its
# pre-compiled cache stays valid
COPY --from=pot --chown=appuser:appuser /app /app

WORKDIR /srv/audio
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY start.sh .

ENV PYTHONUNBUFFERED=1 \
    YTDLP_JS_RUNTIME=deno \
    TEMP_DIR=/tmp/sound2song \
    YTDLP_POT_PROVIDER_URL=http://127.0.0.1:4416 \
    DENO_DIR=/app/.cache/deno \
    DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

USER appuser

EXPOSE 8000
# start.sh starts the token server in the background, then the audio service
CMD ["sh", "start.sh"]
