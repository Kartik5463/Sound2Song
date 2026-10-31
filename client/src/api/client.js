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
  return (
    err.response?.data?.message ||
    (err.code === 'ECONNABORTED' ? 'The request timed out.' : 'Could not reach the server.')
  )
}

export const getHealth = () => api.get('/health', { timeout: 10000 }).then((res) => res.data)

/** Identify the songs in a video. refresh=true ignores any saved result. */
export const identifySong = (url, { refresh = false } = {}) =>
  api.post('/identify', { url, refresh }).then((res) => res.data)

/** A saved result, without analyzing again. */
export const getSavedResult = (videoId) =>
  api.get(`/searches/${encodeURIComponent(videoId)}`, { timeout: 15000 }).then((res) => res.data)

export const getHistory = () => api.get('/history', { timeout: 15000 }).then((res) => res.data.items)

export const deleteHistoryItem = (videoId) => api.delete(`/history/${encodeURIComponent(videoId)}`)

export const clearHistory = () => api.delete('/history')

export default api
