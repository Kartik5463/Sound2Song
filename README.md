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
3. **Recognition and results**: identify segments with Shazam, merge matches, handle multiple songs per video, add iTunes details, cache results in MongoDB, build the results card. *(done)*
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

`POST /api/identify { "url": "<youtube url>" }` → Express checks the URL (and the MongoDB cache) → audio service `POST /identify`:

1. **Download**: yt-dlp gets the video info, rejects live streams and videos over 15 minutes, then downloads the audio-only stream (using Node as its JavaScript runtime).
2. **Convert**: FFmpeg turns it into mono 16 kHz WAV, cuts low rumble and evens out the loudness (`dynaudnorm`).
3. **Analyze**: FFmpeg `silencedetect` finds silent parts so they're skipped.
4. **Split**: the remaining audio is cut into 12-second segments, the window Shazam listens to (at most 75 per video).

Temporary files are deleted after every request. All limits can be changed in `audio-service/.env`.

## How song recognition works (Phase 3)

Shazam's free endpoint (used through [shazamio](https://github.com/shazamio/ShazamIO)) allows only about **3 requests at once, then roughly 1 every 15–20 seconds per IP address**. Checking every segment would take minutes, so only a few are checked:

1. **Spread out**: check about one segment per 90 s of audio (at least 3), so a 4-minute song takes 3 requests.
2. **Fill in**: if two checks found the same song, the segments between them are marked as that song ("inferred").
3. **Narrow down**: if two neighbouring checks disagree, check the segment in the middle, repeating until the boundary is found or the budget (8 requests / 90 s) runs out.
4. **Keep looking**: if nothing was found yet, check the largest unchecked gaps.

A shared rate limiter spaces requests out, and pauses when Shazam says "too many requests". If Shazam blocks everything for the whole time budget, the user gets a "busy, try again in a minute" message.

**Confidence** grows with each check that found the same song: 75% for one clean match, 94% for two, 98% for three (capped at 99%). Matches with a time or pitch "skew" (sped-up or pitch-shifted edits, and most wrong answers) count for less.

**Details** come from Shazam (title, artist, album, label, year, genre, cover, 30 s preview) and the free iTunes Search API (track length, Apple Music link, and any missing fields).

**Caching**: results are stored in MongoDB, one document per video, and reused for 7 days (`CACHE_DAYS`). Send `"refresh": true` (the "Analyze again" link) to ignore the saved result.

## Tests

```bash
npm run test:audio
```
