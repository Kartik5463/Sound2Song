import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import healthRoutes from './routes/health.routes.js'
import identifyRoutes from './routes/identify.routes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: env.clientUrl }))
app.use(express.json({ limit: '10kb' }))
app.use(morgan('dev'))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60 }))

app.use('/api/health', healthRoutes)
app.use('/api/identify', identifyRoutes)

app.use(notFound)
app.use(errorHandler)

export default app
