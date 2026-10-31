export function notFound(req, res) {
  res.status(404).json({ code: 'not_found', message: `Not found: ${req.originalUrl}` })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({
    code: err.code || 'server_error',
    message: status >= 500 && !err.code ? 'Something went wrong on the server.' : err.message,
  })
}
