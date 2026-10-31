const ID_RE = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'])

/** Return the 11-character video ID from any common YouTube URL, or null. */
export function extractVideoId(input) {
  if (typeof input !== 'string' || !input.trim()) return null
  let raw = input.trim()
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`

  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (!HOSTS.has(host)) return null

  const parts = url.pathname.split('/').filter(Boolean)
  let id = null
  if (host === 'youtu.be') id = parts[0]
  else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1]
  else id = url.searchParams.get('v')

  return id && ID_RE.test(id) ? id : null
}
