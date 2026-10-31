import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { identify, identifyUpload, getSaved } from '../controllers/identify.controller.js'

const router = Router()

// Processing is heavy, so allow fewer requests than the rest of the API
const identifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  message: { code: 'rate_limited', message: 'Too many requests. Please wait a minute and try again.' },
})

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 200
const uploadDir = path.join(os.tmpdir(), 'sound2song-uploads')
fs.mkdirSync(uploadDir, { recursive: true })

// Accept audio/video files; some browsers send odd types for valid files, so also
// allow common extensions. The audio service checks the content properly anyway.
const EXTENSIONS = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|aiff?|amr|mp4|m4v|mov|mkv|webm|avi|wmv|flv|3gp|mpeg|mpg|ts)$/i
const upload = multer({
  dest: uploadDir,
  defParamCharset: 'utf8', // keep non-English file names intact
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter(req, file, cb) {
    const ok = /^(audio|video)\//.test(file.mimetype) || EXTENSIONS.test(file.originalname)
    if (ok) return cb(null, true)
    const err = new Error('Please choose an audio or video file (MP3, WAV, M4A, MP4, MOV…).')
    err.status = 415
    err.code = 'unsupported_file'
    cb(err)
  },
})

/** Run multer and turn its errors into friendly JSON errors. */
function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE'
      err.status = tooBig ? 413 : 400
      err.message = tooBig ? `This file is too big. The limit is ${MAX_UPLOAD_MB} MB.` : 'Invalid upload.'
      err.code = tooBig ? 'file_too_big' : 'invalid_upload'
    }
    next(err)
  })
}

router.post('/identify', identifyLimiter, identify)
router.post('/identify/upload', identifyLimiter, receiveFile, identifyUpload)
router.get('/searches/:videoId', getSaved)

export default router
