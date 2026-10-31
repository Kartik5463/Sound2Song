import { extractVideoId } from '../utils/youtube.js'
import { processVideo } from '../services/audioService.js'

// POST /api/identify  { url }
// Phase 2: returns the prepared audio (metadata + segments). Phase 3 adds recognition.
export async function identify(req, res) {
  const { url } = req.body ?? {}
  const videoId = extractVideoId(url)
  if (!videoId) {
    return res.status(400).json({ code: 'invalid_url', message: "That doesn't look like a valid YouTube video URL." })
  }

  const result = await processVideo(`https://www.youtube.com/watch?v=${videoId}`)
  res.json(result)
}
