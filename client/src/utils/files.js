// Must match the server's limit (MAX_UPLOAD_MB)
export const MAX_UPLOAD_MB = 200

const EXTENSIONS = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|aiff?|amr|mp4|m4v|mov|mkv|webm|avi|wmv|flv|3gp|mpeg|mpg|ts)$/i

export const ACCEPT = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.mp4,.mov,.mkv,.webm,.avi'

/** null if the file looks usable, otherwise a message for the user. */
export function checkFile(file) {
  if (!file) return 'Choose an audio or video file.'
  const looksLikeMedia = /^(audio|video)\//.test(file.type) || EXTENSIONS.test(file.name)
  if (!looksLikeMedia) return 'Please choose an audio or video file (MP3, WAV, M4A, MP4, MOV…).'
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `This file is too big. The limit is ${MAX_UPLOAD_MB} MB.`
  return null
}

export function formatSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const isVideoFile = (file) => /^video\//.test(file?.type) || /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|3gp|mpe?g|ts)$/i.test(file?.name ?? '')
