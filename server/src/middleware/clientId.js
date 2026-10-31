// Each browser makes up a random id (stored in localStorage) and sends it with every
// request. It lets us keep a personal search history without accounts or cookies.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function clientId(req, res, next) {
  const id = req.get('X-Client-Id')
  req.clientId = id && UUID_RE.test(id) ? id.toLowerCase() : null
  next()
}

/** For routes that only make sense with a client id (the history endpoints). */
export function requireClientId(req, res, next) {
  if (!req.clientId) {
    return res.status(400).json({ code: 'missing_client_id', message: 'Missing or invalid X-Client-Id header.' })
  }
  next()
}
