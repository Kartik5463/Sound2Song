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

A shared rate limiter spaces requests out, and pauses when Shazam says "too many requests". If Shazam blocks everything for the whole time budget, the user gets a "busy, try again in a minute" message.

**Confidence** is based on shazamio's own measurements: answers without time/pitch "skew" were right ~99% of the time, skewed ones ~40%. One clean match gives 90%, two give 99%; a skewed match gives 40% and triggers a second check.

**Details** come from Shazam (title, artist, album, label, year, genre, cover, 30 s preview) and the free iTunes Search API (track length, Apple Music link, and any missing fields).

**Caching**: results are stored in MongoDB, one document per video, and reused for 7 days (`CACHE_DAYS`). Send `"refresh": true` (the "Analyze again" link) to ignore the saved result.

## Tests

```bash
npm run test:audio
```

## Search history and sharing (Phase 4)

- Each browser gets a random id (stored in `localStorage`, sent as `X-Client-Id`). The server keeps that browser's last 50 searches in MongoDB, with no accounts or cookies.
- Clicking a history item opens the saved result instantly, without using Shazam.
- The address bar shows `?v=<videoId>` for the current result, so links can be shared or reloaded.

API:

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/identify` | `{ url, refresh? }` identify songs (cached for 7 days) |
| `GET` | `/api/searches/:videoId` | A saved result, without analyzing again |
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
- **Shazam limit is per server**: all users share roughly 3–4 new videos per minute. Saved results don't count against it.

To run the production build locally: `npm run build`, then start the server with `NODE_ENV=production SERVE_CLIENT=true npm start` and open http://localhost:5000.

