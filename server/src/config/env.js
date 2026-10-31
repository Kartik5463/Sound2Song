import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Load server/.env no matter which folder the server is started from
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true })

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || '',
  audioServiceUrl: process.env.AUDIO_SERVICE_URL || 'http://localhost:8000',
  // Shared secret sent to the audio service so only this API can use it (optional locally)
  audioServiceToken: process.env.AUDIO_SERVICE_TOKEN || '',
  // Allowed browser origins, comma separated. Not needed when the API serves the client itself.
  clientUrls: list(process.env.CLIENT_URL || 'http://localhost:5173'),
  // Serve the built React app (client/dist) from this server, for single-service hosting
  serveClient: process.env.SERVE_CLIENT === 'true',
  // Number of proxies in front of the app (Render, Railway...), so rate limits see real IPs
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  // Reuse a saved result for the same video for this many days
  cacheDays: Number(process.env.CACHE_DAYS) || 7,
}
