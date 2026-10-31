import fs from 'node:fs'
import axios from 'axios'
import { env } from '../config/env.js'

const audioApi = axios.create({
  baseURL: env.audioServiceUrl,
  headers: env.audioServiceToken ? { 'X-Service-Token': env.audioServiceToken } : {},
})

const IDENTIFY_TIMEOUT = 8 * 60 * 1000

export async function pingAudioService() {
  try {
    await audioApi.get('/health', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/** Turn an axios error from the audio service into an Error with status/code for the client. */
function toServiceError(err) {
  // Pass the audio service's own error message through to the client
  if (err.response?.data?.message) {
    const e = new Error(err.response.data.message)
    e.status = err.response.status
    e.code = err.response.data.code
    return e
  }
  // In development the usual cause is that the Python service was never started
  const devHint = env.isProduction
    ? ''
    : ' Start it with "npm run dev:audio", or run "npm run dev" in the project folder to start everything.'
  const timedOut = err.code === 'ECONNABORTED'
  const e = new Error(timedOut ? 'Song identification timed out.' : `The audio service is not reachable.${devHint}`)
  e.status = timedOut ? 504 : 503
  e.code = 'audio_service_unavailable'
  return e
}

/** Ask the audio service to download the video's audio and recognize the songs in it. */
export async function identifyVideo(url) {
  try {
    const { data } = await audioApi.post('/identify', { url }, { timeout: IDENTIFY_TIMEOUT })
    return data
  } catch (err) {
    throw toServiceError(err)
  }
}

/** Send an uploaded file (saved at `path`) to the audio service for recognition. */
export async function identifyFile(path, fileName, mimeType) {
  const form = new FormData()
  // openAsBlob streams the file from disk instead of loading it into memory
  form.append('file', await fs.openAsBlob(path, { type: mimeType || 'application/octet-stream' }), fileName)
  form.append('name', fileName)
  try {
    const { data } = await audioApi.post('/identify-file', form, {
      timeout: IDENTIFY_TIMEOUT,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    return data
  } catch (err) {
    throw toServiceError(err)
  }
}
