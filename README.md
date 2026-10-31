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
| Extra metadata / cover art | iTunes Search API, MusicBrainz (free, no key) |
| Hosting (later) | Vercel (client), Render (API + audio service) |

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
3. **Recognition and results**: identify each segment, merge repeated matches, handle multiple songs per video, enrich the metadata, cache results in MongoDB, build the results card.
4. **History, polish and deploy**: search history, loading and error states, input validation, rate limiting, responsive UI, free deployment.

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

## How the audio pipeline works (Phase 2)

`POST /api/identify { "url": "<youtube url>" }` → Express checks the URL → audio service `POST /process`:

1. **Download**: yt-dlp gets the video info, rejects live streams and videos over 15 minutes, then downloads the audio-only stream (using Node as its JavaScript runtime).
2. **Convert**: FFmpeg turns it into mono 16 kHz WAV, cuts low rumble and evens out the loudness (`dynaudnorm`).
3. **Analyze**: FFmpeg `silencedetect` finds silent parts so they're skipped.
4. **Split**: the remaining audio is cut into 20-second segments (at most 60 per video).

Temporary files are deleted after every request. All limits can be changed in `audio-service/.env`.

## Tests

```bash
cd audio-service
.venv\Scripts\python -m pytest -q
```
