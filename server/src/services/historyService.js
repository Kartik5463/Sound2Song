import History from '../models/History.js'
import Search from '../models/Search.js'
import { isDBConnected } from '../config/db.js'

// Keep at most this many entries per browser
const MAX_ENTRIES = 50

/** Remember that this browser searched this video. Never throws. */
export async function recordSearch(clientId, videoId) {
  if (!clientId || !isDBConnected()) return
  try {
    await History.updateOne(
      { clientId, videoId },
      { $set: { searchedAt: new Date() } },
      { upsert: true },
    )
    // Drop the oldest entries beyond the limit
    const old = await History.find({ clientId })
      .sort({ searchedAt: -1 })
      .skip(MAX_ENTRIES)
      .select('_id')
      .lean()
    if (old.length) await History.deleteMany({ _id: { $in: old.map((h) => h._id) } })
  } catch (err) {
    console.error('[history] Failed to record search:', err.message)
  }
}

/** This browser's recent searches, newest first, with a short summary of each result. */
export async function listHistory(clientId, limit = 20) {
  const entries = await History.find({ clientId }).sort({ searchedAt: -1 }).limit(limit).lean()
  const searches = await Search.find({ videoId: { $in: entries.map((e) => e.videoId) } })
    .select('videoId source title channel thumbnail status songs.title songs.artist songs.coverUrl songs.mashup.title')
    .lean()
  const byVideo = new Map(searches.map((s) => [s.videoId, s]))

  return entries
    .filter((e) => byVideo.has(e.videoId))
    .map((e) => {
      const s = byVideo.get(e.videoId)
      return {
        videoId: e.videoId,
        source: s.source ?? 'youtube',
        searchedAt: e.searchedAt,
        videoTitle: s.title,
        channel: s.channel,
        thumbnail: s.thumbnail,
        status: s.status,
        songCount: s.songs.length,
        song: s.songs[0] ?? null, // the first song found, for the list item
      }
    })
}

export const removeEntry = (clientId, videoId) => History.deleteOne({ clientId, videoId })

export const clearHistory = (clientId) => History.deleteMany({ clientId })
