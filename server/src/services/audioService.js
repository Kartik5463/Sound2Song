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
  const e = new Error(
    timedOut
      ? 'Song identification timed out.'
      : `The audio service is not reachable. It may be starting up; please try again in a minute.${devHint}`,
  )
  e.status = timedOut ? 504 : 503
  e.code = 'audio_service_unavailable'
  return e
}

// How long to wait for a sleeping or restarting audio service to come back (free hosting
// spins services down; waking one, with its token server and WARP proxy, takes a while)
const WAKE_TIMEOUT = Number(process.env.AUDIO_WAKE_TIMEOUT_MS) || 120_000
const WAKE_POLL = 5_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * True when the error means "the service isn't up yet" rather than a real answer from it:
 * no connection at all, or a gateway error page (502/503/504) from the hosting platform
 * instead of the service's own JSON error.
 */
function isServiceDown(err) {
  if (err.code === 'ECONNABORTED') return false // it answered too slowly: a real timeout
  if (!err.response) return true // connection refused / reset / DNS
  return [502, 503, 504].includes(err.response.status) && !err.response.data?.message
}

/** Poll /health until the audio service answers, or give up after WAKE_TIMEOUT. */
async function waitUntilReady() {
  const deadline = Date.now() + WAKE_TIMEOUT
  while (Date.now() < deadline) {
    if (await pingAudioService()) return true
    await sleep(WAKE_POLL)
  }
  return false
}

/** Send a request; if the service is asleep or restarting, wait for it and try once more. */
async function withWakeRetry(send) {
  try {
    return (await send()).data
  } catch (err) {
    if (!isServiceDown(err)) throw toServiceError(err)
    console.warn('[audio] Audio service not ready, waiting for it to start...')
    if (!(await waitUntilReady())) throw toServiceError(err)
    try {
      return (await send()).data
    } catch (retryErr) {
      throw toServiceError(retryErr)
    }
  }
}

/** Ask the audio service to download the video's audio and recognize the songs in it. */
export function identifyVideo(url) {
  return withWakeRetry(() => audioApi.post('/identify', { url }, { timeout: IDENTIFY_TIMEOUT }))
}

/** Send an uploaded file (saved at `path`) to the audio service for recognition. */
export function identifyFile(path, fileName, mimeType) {
  return withWakeRetry(async () => {
    // Build the form on every attempt: a request body can only be sent once
    const form = new FormData()
    // openAsBlob streams the file from disk instead of loading it into memory
    form.append('file', await fs.openAsBlob(path, { type: mimeType || 'application/octet-stream' }), fileName)
    form.append('name', fileName)
    return audioApi.post('/identify-file', form, {
      timeout: IDENTIFY_TIMEOUT,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  })
}
