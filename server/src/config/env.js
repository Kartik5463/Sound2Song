import 'dotenv/config'

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || '',
  audioServiceUrl: process.env.AUDIO_SERVICE_URL || 'http://localhost:8000',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Reuse a saved result for the same video for this many days
  cacheDays: Number(process.env.CACHE_DAYS) || 7,
}
