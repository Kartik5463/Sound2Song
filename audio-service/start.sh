#!/bin/sh
# Container entrypoint: start the PO token server in the background (unless switched off
# with POT_SERVER=off), then the audio service in the foreground.

if [ -n "$YTDLP_POT_PROVIDER_URL" ] && [ "${POT_SERVER:-on}" != "off" ]; then
  echo "[start] Starting PO token server on 127.0.0.1:4416"
  # Same command as the official image; binds to localhost only, so it isn't public
  deno run --allow-env --allow-net \
    --allow-ffi=/app/node_modules --allow-read=/app/node_modules \
    /app/src/main.ts --port 4416 &
else
  echo "[start] PO token server switched off"
  unset YTDLP_POT_PROVIDER_URL
fi

# Hosting platforms (Render, Railway, Fly) pass the port in $PORT
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
