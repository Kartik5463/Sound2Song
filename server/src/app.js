import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import { clientId } from './middleware/clientId.js'
import healthRoutes from './routes/health.routes.js'
import identifyRoutes from './routes/identify.routes.js'
import historyRoutes from './routes/history.routes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')

if (env.trustProxy) app.set('trust proxy', env.trustProxy)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Cover art, thumbnails and 30 s previews come from YouTube / Apple / Shazam CDNs
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'https:'],
      },
    },
  }),
)
app.use(cors({ origin: env.clientUrls }))
app.use(express.json({ limit: '10kb' }))
app.use(morgan(env.isProduction ? 'combined' : 'dev'))
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    message: { code: 'rate_limited', message: 'Too many requests. Please wait a minute and try again.' },
  }),
)
app.use('/api', clientId)

app.use('/api/health', healthRoutes)
app.use('/api', identifyRoutes)
app.use('/api/history', historyRoutes)
app.use('/api', notFound)

// Single-service hosting: serve the React build and let it handle its own routes
if (env.serveClient && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.use(notFound)
app.use(errorHandler)

export default app
