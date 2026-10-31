import Search from '../models/Search.js'
import { isDBConnected } from '../config/db.js'
import { env } from '../config/env.js'
import { extractVideoId } from '../utils/youtube.js'
import { identifyVideo } from '../services/audioService.js'
import { enrichSongs } from '../services/metadataService.js'

/** Shape a saved document like a fresh result, so the client handles both the same way. */
function toResponse(doc, cached) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject({ flattenMaps: true })
  return { ...rest, searchedAt: doc.lastSearchedAt, cached }
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

async function saveResult(videoId, url, result) {
  if (!isDBConnected()) return null
  try {
    return await Search.findOneAndUpdate(
      { videoId },
      {
        $set: { ...result, videoId, url, lastSearchedAt: new Date() },
        $inc: { searchCount: 1 },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    )
  } catch (err) {
    console.error('[db] Failed to save search:', err.message)
    return null
  }
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

  if (!refresh) {
    const cached = await findCached(videoId)
    if (cached) return res.json(toResponse(cached, true))
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const raw = await identifyVideo(watchUrl)
  const songs = await enrichSongs(raw.songs)

  const result = {
    title: raw.title,
    channel: raw.channel,
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    status: songs.length ? 'done' : 'not_found',
    songs,
    segments: raw.segments,
    silence: raw.silence,
    timings: raw.timings,
  }

  const saved = await saveResult(videoId, watchUrl, result)
  if (saved) return res.json(toResponse(saved, false))
  res.json({ ...result, videoId, url: watchUrl, searchedAt: new Date(), cached: false })
}
