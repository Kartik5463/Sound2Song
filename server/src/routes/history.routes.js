import { Router } from 'express'
import { requireClientId } from '../middleware/clientId.js'
import { getHistory, deleteHistoryItem, deleteHistory } from '../controllers/history.controller.js'

const router = Router()

router.use(requireClientId)
router.get('/', getHistory)
router.delete('/', deleteHistory)
router.delete('/:videoId', deleteHistoryItem)

export default router
