import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 6 * 60 * 1000,
})

/** Turn any request error into a message that can be shown to the user. */
export function errorMessage(err) {
  return (
    err.response?.data?.message ||
    (err.code === 'ECONNABORTED' ? 'The request timed out.' : 'Could not reach the server.')
  )
}

export const getHealth = () => api.get('/health', { timeout: 10000 }).then((res) => res.data)

export const identifySong = (url) => api.post('/identify', { url }).then((res) => res.data)

export default api
