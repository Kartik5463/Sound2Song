import { useRef, useState } from 'react'
import { UploadCloud, FileAudio, FileVideo, X, Loader2, Search } from 'lucide-react'
import { ACCEPT, MAX_UPLOAD_MB, formatSize, isVideoFile } from '../utils/files'

/** Drag-and-drop area (or click to browse) for an audio/video file, then an Identify button. */
export default function UploadDropzone({ file, onFile, onSubmit, loading, uploadProgress }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)

  function pick(files) {
    if (files?.[0]) onFile(files[0])
  }

  if (file) {
    const Icon = isVideoFile(file) ? FileVideo : FileAudio
    const uploading = loading && uploadProgress < 1
    return (
      <div className="rounded-2xl border border-latte-300 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-latte-100 text-latte-700">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-latte-950" title={file.name}>
              {file.name}
            </div>
            <div className="text-xs text-latte-600">
              {formatSize(file.size)}
              {uploading && ` · uploading ${Math.round(uploadProgress * 100)}%`}
              {loading && !uploading && ' · uploaded, listening for songs…'}
            </div>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={() => onFile(null)}
              aria-label="Remove file"
              className="rounded-lg p-1.5 text-latte-500 hover:bg-latte-100 hover:text-latte-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onSubmit} disabled={loading} className="btn-primary w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Identifying…' : 'Identify Song'}
          </button>
        </div>
        {loading && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-latte-100">
            <div
              className={`h-full rounded-full bg-linear-to-r from-latte-500 to-latte-700 transition-all ${
                uploading ? '' : 'w-full animate-pulse'
              }`}
              style={uploading ? { width: `${Math.max(3, uploadProgress * 100)}%` } : undefined}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        pick(e.dataTransfer.files)
      }}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
        dragging ? 'border-latte-600 bg-latte-100' : 'border-latte-300 bg-white/70 hover:border-latte-500 hover:bg-white'
      }`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-latte-100 text-latte-700">
        <UploadCloud className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold text-latte-900">
        {dragging ? 'Drop to upload' : 'Drop an audio or video file here, or click to browse'}
      </span>
      <span className="text-xs text-latte-600">
        MP3, WAV, M4A, FLAC, MP4, MOV, MKV… up to {MAX_UPLOAD_MB} MB and 15 minutes
      </span>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = '' // allow choosing the same file again
        }}
      />
    </button>
  )
}
