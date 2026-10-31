import axios from 'axios'
import { getClientId } from '../utils/clientId'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 6 * 60 * 1000,
})

// Identify this browser so the server can keep its search history
api.interceptors.request.use((config) => {
  config.headers['X-Client-Id'] = getClientId()
  return config
})

/** Turn any request error into a message that can be shown to the user. */
export function errorMessage(err) {
  if (err.response?.data?.message) return err.response.data.message
  const status = err.response?.status
  if (status === 429) return 'Too many requests. Please wait a minute and try again.'
  if (status === 413) return 'This file is too big.'
  if (status) return `Something went wrong on the server (error ${status}). Please try again.`
  if (err.code === 'ECONNABORTED') return 'The request timed out.'
  return 'Could not reach the server.'
}

export const getHealth = () => api.get('/health', { timeout: 10000 }).then((res) => res.data)

/** Identify the songs in a video. refresh=true ignores any saved result. */
export const identifySong = (url, { refresh = false } = {}) =>
  api.post('/identify', { url, refresh }).then((res) => res.data)

/**
 * Identify the songs in an audio or video file from the user's computer.
 * onProgress(0..1) reports the upload; analysis starts once it reaches 1.
 */
export function identifyUpload(file, { refresh = false, onProgress } = {}) {
  const form = new FormData()
  form.append('refresh', String(refresh))
  form.append('file', file)
  return api
    .post('/identify/upload', form, {
      onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total),
    })
    .then((res) => res.data)
}

/** A saved result, without analyzing again. */
export const getSavedResult = (videoId) =>
  api.get(`/searches/${encodeURIComponent(videoId)}`, { timeout: 15000 }).then((res) => res.data)

export const getHistory = () => api.get('/history', { timeout: 15000 }).then((res) => res.data.items)

export const deleteHistoryItem = (videoId) => api.delete(`/history/${encodeURIComponent(videoId)}`)

export const clearHistory = () => api.delete('/history')

export default api
