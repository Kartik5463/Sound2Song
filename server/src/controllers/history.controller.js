import { isDBConnected } from '../config/db.js'
import { listHistory, removeEntry, clearHistory } from '../services/historyService.js'

function dbUnavailable(res) {
  return res.status(503).json({ code: 'db_unavailable', message: 'History is unavailable: no database connection.' })
}

// GET /api/history?limit=20
export async function getHistory(req, res) {
  if (!isDBConnected()) return dbUnavailable(res)
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
  res.json({ items: await listHistory(req.clientId, limit) })
}

// DELETE /api/history/:videoId
export async function deleteHistoryItem(req, res) {
  if (!isDBConnected()) return dbUnavailable(res)
  await removeEntry(req.clientId, req.params.videoId)
  res.status(204).end()
}

// DELETE /api/history
export async function deleteHistory(req, res) {
  if (!isDBConnected()) return dbUnavailable(res)
  await clearHistory(req.clientId)
  res.status(204).end()
}
