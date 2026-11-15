#!/bin/sh
# Container entrypoint: start optional helpers in the background, then the audio service.
#  - PO token server (on unless POT_SERVER=off)
#  - Cloudflare WARP proxy (off unless WARP=on)

# ---------- PO token server ----------
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

# ---------- Cloudflare WARP proxy ----------
# YouTube then sees a Cloudflare WARP IP instead of the hosting provider's IP.
if [ "${WARP:-off}" = "on" ]; then
  WARP_DIR=/tmp/warp
  mkdir -p "$WARP_DIR"
  cd "$WARP_DIR" || exit 1

  # Reuse a saved WARP account if one is provided as a secret file; otherwise register a
  # new free account (Cloudflare rate-limits registrations, so retry a few times)
  if [ -f /etc/secrets/wgcf-account.toml ]; then
    echo "[start] Using saved WARP account from /etc/secrets/wgcf-account.toml"
    cp /etc/secrets/wgcf-account.toml ./wgcf-account.toml
  else
    for attempt in 1 2 3; do
      echo "[start] Registering a WARP account (attempt $attempt)"
      wgcf register --accept-tos && break
      sleep $((attempt * 15))
    done
  fi

  if [ -f wgcf-account.toml ] && wgcf generate; then
    printf 'WGConfig = %s/wgcf-profile.conf\n\n[Socks5]\nBindAddress = 127.0.0.1:40000\n' "$WARP_DIR" > wireproxy.conf
    wireproxy -c wireproxy.conf &
    # Only use WARP if no other proxy was set explicitly
    export YTDLP_PROXY="${YTDLP_PROXY:-socks5://127.0.0.1:40000}"
    echo "[start] WARP proxy starting on 127.0.0.1:40000; yt-dlp will use $YTDLP_PROXY"
  else
    echo "[start] WARP setup failed; continuing without it"
  fi
  cd /srv/audio || exit 1
fi

# Hosting platforms (Render, Railway, Fly) pass the port in $PORT
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
