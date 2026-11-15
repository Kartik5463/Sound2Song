#!/bin/sh
# Container entrypoint: start optional helpers in the background, then the audio service.
#  - PO token server (on unless POT_SERVER=off)
#  - Cloudflare WARP proxy (off unless WARP=on)
# The web server always starts immediately, so the host sees the service come up quickly
# even if a helper is slow; the app only uses a helper once it is actually running.

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
setup_warp() {
  WARP_DIR=/tmp/warp
  mkdir -p "$WARP_DIR" && cd "$WARP_DIR" || return 1

  # Reuse a saved WARP account if one is provided as a secret file; otherwise register a
  # new free account (Cloudflare rate-limits registrations, so retry a few times)
  if [ -f /etc/secrets/wgcf-account.toml ]; then
    echo "[warp] Using saved WARP account from /etc/secrets/wgcf-account.toml"
    cp /etc/secrets/wgcf-account.toml ./wgcf-account.toml
  else
    for attempt in 1 2 3 4; do
      echo "[warp] Registering a WARP account (attempt $attempt)"
      wgcf register --accept-tos && break
      sleep $((attempt * 20))
    done
  fi

  if [ -f wgcf-account.toml ] && wgcf generate; then
    printf 'WGConfig = %s/wgcf-profile.conf\n\n[Socks5]\nBindAddress = 127.0.0.1:40000\n' "$WARP_DIR" > wireproxy.conf
    echo "[warp] WARP proxy starting on 127.0.0.1:40000"
    exec wireproxy -c wireproxy.conf
  fi
  echo "[warp] WARP setup failed; YouTube requests go out directly"
}

if [ "${WARP:-off}" = "on" ]; then
  # Point yt-dlp at the local WARP proxy (unless another proxy was set explicitly). The app
  # only uses it once it is listening, so requests made during setup still go out directly.
  export YTDLP_PROXY="${YTDLP_PROXY:-socks5://127.0.0.1:40000}"
  (setup_warp) &
fi

# Hosting platforms (Render, Railway, Fly) pass the port in $PORT
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
