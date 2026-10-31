import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { identify } from '../controllers/identify.controller.js'

const router = Router()

// Processing is heavy, so allow fewer requests than the rest of the API
const identifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  message: { code: 'rate_limited', message: 'Too many requests. Please wait a minute and try again.' },
})

router.post('/', identifyLimiter, identify)

export default router
