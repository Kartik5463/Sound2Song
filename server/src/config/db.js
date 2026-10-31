import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDB() {
  if (!env.mongoUri) {
    console.warn('[db] MONGO_URI is not set - running without a database')
    return
  }
  try {
    await mongoose.connect(env.mongoUri)
    console.log('[db] Connected to MongoDB')
  } catch (err) {
    console.error('[db] Connection failed:', err.message)
  }
}

export const isDBConnected = () => mongoose.connection.readyState === 1
