import axios from 'axios'
import { env } from '../config/env.js'

const audioApi = axios.create({ baseURL: env.audioServiceUrl })

export async function pingAudioService() {
  try {
    await audioApi.get('/health', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/** Ask the audio service to download the video's audio and recognize the songs in it. */
export async function identifyVideo(url) {
  try {
    const { data } = await audioApi.post('/identify', { url }, { timeout: 8 * 60 * 1000 })
    return data
  } catch (err) {
    // Pass the audio service's own error message through to the client
    if (err.response?.data?.message) {
      const e = new Error(err.response.data.message)
      e.status = err.response.status
      e.code = err.response.data.code
      throw e
    }
    const e = new Error(
      err.code === 'ECONNABORTED' ? 'Song identification timed out.' : 'The audio service is not reachable.',
    )
    e.status = err.code === 'ECONNABORTED' ? 504 : 503
    e.code = 'audio_service_unavailable'
    throw e
  }
}
