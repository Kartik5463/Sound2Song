# Sound2Song – YouTube Song Identifier

Paste a YouTube URL and find out which songs are playing in it: title, artist, album, confidence and time range.

## Stack (all free)

| Layer | Tool |
|---|---|
| Frontend | React (Vite) + Tailwind CSS |
| API | Node.js + Express |
| Database | MongoDB Atlas (free M0 cluster) + Mongoose |
| Audio service | Python + FastAPI |
| Audio download | yt-dlp |
| Audio processing | FFmpeg |
| Song recognition | shazamio (free, no API key) |
| Extra metadata / cover art | iTunes Search API (free, no key) |
| Hosting | Render free tier (see [Deploying for free](#deploying-for-free)) |

## Project structure

```
Sound2Song/
├── client/          React app (port 5173)
├── server/          Express API (port 5000)
└── audio-service/   Python FastAPI audio service (port 8000)
```

## Phases

1. **Foundation**: project setup, the three services talking to each other, MongoDB connection, UI shell. *(done)*
2. **Audio pipeline**: download audio with yt-dlp, convert it with FFmpeg, remove silence and split it into segments. *(done)*
3. **Recognition and results**: identify segments with Shazam, merge matches, handle multiple songs per video, add iTunes details, cache results in MongoDB, build the results card. *(done)*
4. **History, polish and deploy**: per-browser search history, shareable result links, loading steps, faster downloads, Docker image and Render blueprint for free hosting. *(done)*

## Getting started

Requirements: Node 20+, Python 3.11+, FFmpeg on your PATH.

```bash
# 1. Install JS dependencies
npm run install:all

# 2. Set up the Python audio service
cd audio-service
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
cd ..

# 3. Create env files from the examples and add your MongoDB Atlas URI to server/.env
copy server\.env.example server\.env
copy audio-service\.env.example audio-service\.env

# 4. Run everything
npm run dev
```

Open http://localhost:5173. The status badges show whether the API, database and audio service are reachable.

`npm run dev` must be run from the project root: it starts all three services. To run them separately (in three terminals) use `npm run dev:client`, `npm run dev:server` and `npm run dev:audio`. If the "Audio service" badge shows **down**, the Python service isn't running.

## How the audio pipeline works (Phase 2)

`POST /api/identify { "url": "<youtube url>" }` → Express checks the URL (and the MongoDB cache) → audio service `POST /identify`:

1. **Download**: yt-dlp gets the video info, rejects live streams and videos over 15 minutes, then downloads a low-bitrate audio stream (format 233, in 4 parallel pieces, ~4x faster than regular audio files).
2. **Convert**: FFmpeg turns it into mono 16 kHz WAV, cuts low rumble and evens out the loudness (`dynaudnorm`).
3. **Analyze**: FFmpeg `silencedetect` finds silent parts so they're skipped, and a song-change detector ([changes.py](audio-service/app/changes.py)) finds moments where the music suddenly sounds different (harmony and tone colour before vs after), which usually means a new song in a montage or compilation. It runs locally with numpy, no API calls.
4. **Plan segments**: the audio is split into sections at silences and detected changes, then each section into segments of about 12 seconds, the window Shazam listens to (at most 75 per video). A segment never spans a detected change. Only the segments that get checked are read, straight from memory.

Temporary files are deleted after every request. All limits can be changed in `audio-service/.env`.

## How song recognition works (Phase 3)

Shazam's free endpoint (used through [shazamio](https://github.com/shazamio/ShazamIO)) allows only about **3 requests at once, then roughly 1 every 15–20 seconds per IP address**. Checking every segment would take minutes, so only a few are checked:

1. **First checks**: videos up to 90 s (Shorts, reels) get **one check per section**, so every song in a montage is heard (a 3-song Short = 3 checks, which fits Shazam's burst). Longer videos get 2 checks for a song-length video, or about one per 3 minutes. (Within one song, verse/chorus changes also look like "changes", so long videos can't afford to check them all.)
2. **Fill in**: if two checks found the same song **and** Shazam's position in the song shows it kept playing (video time minus song position matches), the segments between them are marked as that song ("inferred"). If the positions don't line up, the video was edited there, so the gap gets checked. Gaps over 150 s are checked too.
3. **Narrow down**: if two neighbouring checks disagree, check the segment in the middle, repeating until the boundary is found or the budget (8 requests / 90 s) runs out.
4. **Keep looking**: if nothing was found yet, check the largest unchecked gaps.

**Mashups and other versions**: in a mashup, two songs usually play *at the same time*, and Shazam only names the loudest one. But its answer also lists every other catalogue track that matched the audio (covers, remixes, and often the mashup itself). These are looked up and shown as "Also matches". If one is a mashup (for example "Darkside X Aja Sanam (Remix)") that includes the song we heard, its title is split into the songs it combines. Parts not heard directly are shown by name with search links, since a name alone could match several recordings ([alternatives.py](audio-service/app/alternatives.py)).

**Watch & listen** ([links.py](audio-service/app/links.py)): each song gets a link to its YouTube video. The link comes first from [MusicBrainz](https://musicbrainz.org) (community-curated links for the exact recording, looked up by ISRC); otherwise yt-dlp searches YouTube and ranks the results. The artist's or label's channel, title match, "official" wording and track length count in favour; lyrics, covers, remixes, live and reaction videos count against. Only a strong match is labelled *official*; anything else is shown as a best match.

**Free downloads** are shown only when MusicBrainz editors have marked a link as "download for free" for that recording (for example an artist's free Bandcamp track). The app never links to unlicensed downloads, so most commercial songs show no download button. MusicBrainz asks apps to identify themselves; set `MUSICBRAINZ_USER_AGENT` in `audio-service/.env` to your app name and a contact URL or email.

A shared rate limiter spaces requests out, and pauses when Shazam says "too many requests". If Shazam blocks everything for the whole time budget, the user gets a "busy, try again in a minute" message.

**Confidence** is based on shazamio's own measurements: answers without time/pitch "skew" were right ~99% of the time, skewed ones ~40%. One clean match gives 90%, two give 99%; a skewed match gives 40% and triggers a second check.

**Details** come from Shazam (title, artist, album, label, year, genre, cover, 30 s preview) and the free iTunes Search API (track length, Apple Music link, and any missing fields).

**Caching**: results are stored in MongoDB, one document per video, and reused for 7 days (`CACHE_DAYS`). Send `"refresh": true` (the "Analyze again" link) to ignore the saved result.

## Tests

```bash
npm run test:audio
```

## Uploading files

Besides YouTube links, you can upload an audio or video file from your computer (MP3, WAV, M4A, FLAC, OGG, MP4, MOV, MKV, WEBM…, up to 200 MB and 15 minutes): use the **Upload a file** tab, drag a file anywhere onto the page, or paste a copied file.

- The Express API receives the file with multer into a temp folder, hashes it (SHA-256), and forwards it to the audio service's `POST /identify-file`. The same steps then run as for links (clean-up, song-change detection, Shazam).
- **Files are deleted right after analysis.** Only the result is stored, under the id `up_<first 24 hex chars of the hash>`, so uploading the same file again returns the saved result instantly.
- Files without an audio track, empty files and files that are too big or too long get a clear error.

## Search history and sharing (Phase 4)

- Each browser gets a random id (stored in `localStorage`, sent as `X-Client-Id`). The server keeps that browser's last 50 searches in MongoDB, with no accounts or cookies.
- Clicking a history item opens the saved result instantly, without using Shazam.
- The address bar shows `?v=<videoId>` for the current result, so links can be shared or reloaded.

API:

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/identify` | `{ url, refresh? }` identify songs (cached for 7 days) |
| `POST` | `/api/identify/upload` | multipart `file` (+ `refresh`): identify songs in an audio/video file |
| `GET` | `/api/searches/:videoId` | A saved result, without analyzing again (YouTube id or `up_…` upload id) |
| `GET` | `/api/history` | This browser's recent searches |
| `DELETE` | `/api/history/:videoId` | Remove one entry |
| `DELETE` | `/api/history` | Clear the history |
| `GET` | `/api/health` | Status of the API, database and audio service |

## Deploying for free

The repo includes a [Render](https://render.com) Blueprint ([render.yaml](render.yaml)) that creates two free services:

- **sound2song-audio**: the Python service, built from [audio-service/Dockerfile](audio-service/Dockerfile) (FFmpeg and Deno included).
- **sound2song-web**: the Express API, which also serves the built React app, so everything is on one URL.

Steps:

1. **MongoDB Atlas**: in *Network Access*, allow `0.0.0.0/0` (Render's free tier has no fixed IP).
2. Push the repo to GitHub.
3. In Render: **New → Blueprint**, pick the repo, and fill in:
   - `AUDIO_SERVICE_TOKEN`: the same long random string on both services (the audio service rejects requests without it).
   - `MONGO_URI`: your Atlas connection string.
   - `AUDIO_SERVICE_URL`: the audio service's URL, e.g. `https://sound2song-audio.onrender.com`.
4. Open the `sound2song-web` URL.

Things to know about free hosting:

- **Sleeping**: free Render services sleep after 15 minutes without traffic; the first request afterwards takes about a minute.
- **YouTube may block cloud servers** ("Sign in to confirm you're not a bot"). If that happens, export YouTube cookies from a browser to a `cookies.txt` file, add it on Render as a *Secret File*, and set `YTDLP_COOKIES_FILE=/etc/secrets/cookies.txt` on the audio service. Use a throwaway Google account for this.
- **PO tokens**: the audio service's Docker image also runs a [PO token server](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) (bgutil, pinned to 2.0.2) on `127.0.0.1:4416`, so yt-dlp can present the "proof of origin" tokens real browsers send. Use it together with the cookies above. `/health` shows `poTokenServer.reachable`; set `POT_SERVER=off` on the audio service to switch it off. Keep the image tag in `Dockerfile` and the `bgutil-ytdlp-pot-provider` version in `requirements.txt` the same. It may not be enough on its own, because YouTube also blocks some data-centre IPs outright.
- **Changing the IP YouTube sees** (settings on the audio service): `WARP=on` starts a built-in Cloudflare WARP proxy (wgcf + wireproxy, free) and sends yt-dlp's traffic through it; `YTDLP_PROXY` takes any proxy URL instead (for example a paid residential proxy, `http://user:pass@host:port`); `YTDLP_FORCE_IPV4=1` makes yt-dlp use IPv4 only. `/health` shows the `network` setup. To avoid re-registering WARP on every restart, add a saved `wgcf-account.toml` as a secret file.
- **Shazam limit is per server**: all users share roughly 3–4 new videos per minute. Saved results don't count against it.

To run the production build locally: `npm run build`, then start the server with `NODE_ENV=production SERVE_CLIENT=true npm start` and open http://localhost:5000.

## Troubleshooting

Problems met while developing and deploying Sound2Song, with their causes and fixes. Start with the quick reference; the sections below explain each one.

### Quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Render build of `sound2song-web` fails with `vite: not found` | `NODE_ENV=production` makes `npm ci` skip the client's build tools | Build command must use `npm ci --prefix client --include=dev` (already in `render.yaml`) |
| `git push` fails with *"The current branch main has no upstream branch"* | Local `main` isn't linked to GitHub yet | Run `git push --set-upstream origin main` once |
| Error `Unauthorized.` | `AUDIO_SERVICE_TOKEN` differs between the two services, or the audio service URL was opened directly | Use identical tokens; open the `sound2song-web` URL, not the audio URL |
| *"The audio service is not reachable"* | Audio service not running (locally) or wrong `AUDIO_SERVICE_URL` (deployed) | Start it with `npm run dev`; check the URL on Render |
| *"YouTube is blocking downloads from this server"* | YouTube distrusts the server's IP address | See [YouTube blocking on cloud servers](#youtube-blocking-on-cloud-servers) |
| YouTube links stop working again after some weeks | YouTube cookies were cancelled or expired | See [Refreshing YouTube cookies](#refreshing-youtube-cookies) |
| *"Too many requests. Please wait a minute"* | The API's own rate limit (5 identifications per minute per visitor) | Wait a minute and try again |
| A search takes 1–2 minutes | Free services waking from sleep, or Shazam's request limit | Wait; repeat searches of the same video are cached |

### Render build fails: `vite: not found`

**Cause.** The web service sets `NODE_ENV=production`. In that mode `npm ci` skips `devDependencies`, which include Vite and Tailwind, so `npm run build` cannot run.

**Fix.** Install the client's development dependencies explicitly during the build:

```
npm ci --prefix server --omit=dev && npm ci --prefix client --include=dev && npm run build --prefix client
```

This is the build command in `render.yaml`. If a service was created before this change, update **Settings → Build Command** on Render and redeploy.

### `Unauthorized.` from the audio service

**Cause.** When `AUDIO_SERVICE_TOKEN` is set, the audio service rejects every request (except `/health`) that doesn't carry the same token. Typical reasons:

- The two services have different values, often because a value was pasted with a trailing space or line break.
- The audio service's own URL was opened in a browser. That is expected to show `Unauthorized.`, because only the API may call it.

**Fix.** Copy the token from `sound2song-audio` and paste it into `sound2song-web` exactly, then redeploy. Both services ignore leading and trailing whitespace around the token, but the values themselves must match. `/health` does not require the token, so a healthy status page does not prove the tokens match.

### "The audio service is not reachable"

- **Locally:** the Python service isn't running. `npm run dev` from the project root starts the client, API and audio service together; `npm run dev:audio` starts the audio service alone.
- **On Render:** check that `AUDIO_SERVICE_URL` on `sound2song-web` matches the audio service's URL (with no trailing slash), and that the audio service shows **Live**. A sleeping service can take about a minute to answer the first request.

### YouTube blocking on cloud servers

**Symptom.** The site shows *"YouTube is blocking downloads from this server"*, and the audio service logs:

```
ERROR: [youtube] <video id>: Sign in to confirm you're not a bot.
```

**Cause.** YouTube scores requests by IP address and treats data-centre ranges (Render, AWS, Vercel and similar) as likely bots. This is decided before yt-dlp's own behaviour matters, so updating yt-dlp alone does not fix it. File uploads are unaffected, because they never contact YouTube.

**Diagnosis.** Open `https://<audio-service-url>/health`. It reports every layer of the YouTube setup without revealing secrets:

```json
{
  "youtubeCookies": {"configured": true, "found": true, "youtubeCookies": 23, "netscapeFormat": true},
  "poTokenServer": {"configured": true, "reachable": true, "version": "2.0.2"},
  "network": {"proxy": "socks5://127.0.0.1:40000", "forceIpv4": true, "warp": true, "proxyListening": true}
}
```

The service also logs YouTube's exact error as `yt-dlp error: …`. Set `YTDLP_DEBUG=1` temporarily for full yt-dlp output, including whether PO tokens were generated. Remove it afterwards: the output is long and contains temporary media URLs.

**Fixes, applied in layers.** All of these are settings on `sound2song-audio`; none needs a code change.

| Layer | Setting | Purpose |
|---|---|---|
| Cookies | Secret file `cookies.txt` + `YTDLP_COOKIES_FILE=/etc/secrets/cookies.txt` | Requests come from a signed-in session |
| PO tokens | Built into the Docker image (on by default; `POT_SERVER=off` disables it) | yt-dlp presents the "proof of origin" token a real browser would |
| Player clients | `YTDLP_PLAYER_CLIENTS`, e.g. `mweb,tv,web_safari` | A video refused to one YouTube client is sometimes allowed for another |
| IP address | `WARP=on` | Routes yt-dlp through a free Cloudflare WARP proxy, so YouTube sees a Cloudflare IP instead of the host's |
| IP address | `YTDLP_PROXY=http://user:pass@host:port` | Any other proxy, such as a paid residential proxy; takes priority over WARP |
| IP version | `YTDLP_FORCE_IPV4=1` | YouTube is reportedly stricter with IPv6 traffic from servers |

**What worked for this deployment.** Cookies and PO tokens alone were not enough on Render's IP. YouTube links started working once yt-dlp was routed through **Cloudflare WARP** (`WARP=on`, with `YTDLP_FORCE_IPV4=1`). Keep the combination of settings that works for you, and change one setting at a time when testing.

**Notes.**

- Cookies are tied to the IP where they were created. If WARP still fails with cookies set, test without them (remove `YTDLP_COOKIES_FILE` but keep the secret file): home-IP cookies arriving from a Cloudflare IP can look suspicious.
- WARP registers a new free account each time the container starts, and Cloudflare rate-limits registrations. If the logs show `WARP setup failed`, run `wgcf register --accept-tos` once on any machine and upload the resulting `wgcf-account.toml` as a secret file with that exact name; it is then reused on every start.
- These are workarounds, not guarantees. YouTube can change its checks at any time. If every layer fails, a residential proxy set through `YTDLP_PROXY` is the most reliable option.

### Refreshing YouTube cookies

Cookies only matter if the working setup uses them (`youtubeCookies.configured` is `true` in `/health`). Refreshing them is not a daily task: they typically last weeks, until YouTube cancels them.

**Signs they need replacing.** YouTube links show the blocking message again, while uploads and saved results still work.

**Procedure.**

1. Use a dedicated, throwaway Google account. Accounts used with download tools can be restricted.
2. In a new private/incognito window, sign in to youtube.com and play any video briefly.
3. Export the cookies with a browser extension such as *Get cookies.txt LOCALLY*, using **Export** (YouTube only, Netscape format). The file must start with `# Netscape HTTP Cookie File`.
4. Close the private window **without signing out**. Signing out cancels the exported cookies.
5. On Render, open **sound2song-audio → Settings → Environment → Secret Files → `cookies.txt`**, replace the contents and save. The service redeploys automatically.

**To make cookies last longer,** don't use that account anywhere else, and don't sign it out or change its password.

**Security.** Treat `cookies.txt` like a password. Never commit it (`.gitignore` excludes `cookies*.txt`), never put it in `render.yaml`, and delete local copies after uploading. If it may have leaked, sign the account out of all devices from its Google account settings.

**Read-only secret files.** Render mounts secret files read-only under `/etc/secrets`, but yt-dlp writes cookies back after each run. The audio service therefore copies the file to a private, writable location at startup; no action is needed.

### Free-tier limits

- **Sleeping:** free Render services sleep after 15 minutes without traffic; the first request afterwards takes about a minute.
- **Instance hours:** Render's free tier includes 750 hours per month per workspace, shared by both services. Sleeping keeps normal use within it.
- **Memory:** a free instance has 512 MB. The audio service, PO token server and WARP proxy fit, but if the service restarts repeatedly, check **Events** for out-of-memory messages and keep `MAX_CONCURRENT_JOBS=1`.
- **Shazam:** the free recognition endpoint allows roughly 3–4 new videos per minute per server, shared by all users. Saved results don't count against it.

### Local development on Windows

- **Ports already in use, or code changes not applied:** closing a terminal can leave Python or Node processes running in the background. Stop the project's `python` and `node` processes, then run `npm run dev` again. The audio service restarts through nodemon rather than uvicorn's `--reload`, which doesn't shut down cleanly under `concurrently` on Windows.
- **A newly installed command isn't recognised:** terminals, including VS Code's, keep the `PATH` they started with. Open a new terminal, or restart VS Code, after installing a tool.

