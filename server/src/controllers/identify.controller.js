import fs from 'node:fs'
import crypto from 'node:crypto'
import Search from '../models/Search.js'
import { isDBConnected } from '../config/db.js'
import { env } from '../config/env.js'
import { extractVideoId } from '../utils/youtube.js'
import { identifyVideo, identifyFile } from '../services/audioService.js'
import { enrichSongs } from '../services/metadataService.js'
import { recordSearch } from '../services/historyService.js'

// YouTube video ids are 11 characters; uploads get "up_" + part of the file's SHA-256
const ID_RE = /^(?:[A-Za-z0-9_-]{11}|up_[a-f0-9]{24})$/

/** Shape a saved document like a fresh result, so the client handles both the same way. */
function toResponse(doc, cached) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject({ flattenMaps: true })
  return { ...rest, searchedAt: doc.lastSearchedAt, analyzedAt: updatedAt, cached }
}

async function findCached(videoId) {
  if (!isDBConnected()) return null
  const freshAfter = new Date(Date.now() - env.cacheDays * 24 * 60 * 60 * 1000)
  return Search.findOneAndUpdate(
    { videoId, updatedAt: { $gte: freshAfter } },
    { $inc: { searchCount: 1 }, $set: { lastSearchedAt: new Date() } },
    { returnDocument: 'after', timestamps: false }, // keep updatedAt = when the result was computed
  )
}

async function saveResult(videoId, result) {
  if (!isDBConnected()) return null
  try {
    return await Search.findOneAndUpdate(
      { videoId },
      { $set: { ...result, videoId, lastSearchedAt: new Date() }, $inc: { searchCount: 1 } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    )
  } catch (err) {
    console.error('[db] Failed to save search:', err.message)
    return null
  }
}

/** Shared by links and uploads: return a cached result if there is one, else null. */
async function cachedResponse(req, id, refresh) {
  if (refresh) return null
  const cached = await findCached(id)
  if (!cached) return null
  await recordSearch(req.clientId, id)
  return toResponse(cached, true)
}

/** Shared by links and uploads: add iTunes details, save, record history, respond. */
async function finish(req, res, id, raw, extra) {
  const songs = await enrichSongs(raw.songs)
  const result = {
    source: raw.source,
    title: raw.title,
    channel: raw.channel,
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    status: songs.length ? 'done' : 'not_found',
    songs,
    segments: raw.segments,
    silence: raw.silence,
    timings: raw.timings,
    ...extra,
  }
  const saved = await saveResult(id, result)
  await recordSearch(req.clientId, id)
  if (saved) return res.json(toResponse(saved, false))
  const now = new Date()
  res.json({ ...result, videoId: id, searchedAt: now, analyzedAt: now, cached: false })
}

// POST /api/identify  { url, refresh? }
export async function identify(req, res) {
  const { url, refresh } = req.body ?? {}
  const videoId = extractVideoId(url)
  if (!videoId) {
    return res
      .status(400)
      .json({ code: 'invalid_url', message: "That doesn't look like a valid YouTube video URL." })
  }

  const cached = await cachedResponse(req, videoId, refresh)
  if (cached) return res.json(cached)

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const raw = await identifyVideo(watchUrl)
  await finish(req, res, videoId, raw, { source: 'youtube', url: watchUrl })
}

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

// POST /api/identify/upload  multipart: file, refresh?
// The file is saved to a temp folder by multer, sent to the audio service, then deleted.
// Only the result is kept. Identical files (same SHA-256) reuse the saved result.
export async function identifyUpload(req, res) {
  const file = req.file
  if (!file) {
    return res.status(400).json({ code: 'no_file', message: 'Choose an audio or video file to upload.' })
  }
  try {
    const id = `up_${(await sha256File(file.path)).slice(0, 24)}`
    const fileName = file.originalname.slice(0, 200)

    const cached = await cachedResponse(req, id, req.body?.refresh === 'true')
    if (cached) return res.json(cached)

    const raw = await identifyFile(file.path, fileName, file.mimetype)
    await finish(req, res, id, raw, { source: 'upload', url: null, fileName, fileSize: file.size })
  } finally {
    fs.promises.unlink(file.path).catch(() => {})
  }
}

// GET /api/searches/:videoId  - a saved result, without analyzing again (history, shared links)
export async function getSaved(req, res) {
  const { videoId } = req.params
  if (!ID_RE.test(videoId)) {
    return res.status(400).json({ code: 'invalid_video_id', message: 'Invalid video id.' })
  }
  if (!isDBConnected()) {
    return res.status(503).json({ code: 'db_unavailable', message: 'Saved results are unavailable right now.' })
  }
  const doc = await Search.findOne({ videoId })
  if (!doc) return res.status(404).json({ code: 'not_saved', message: 'This has not been analyzed yet.' })
  res.json(toResponse(doc, true))
}
