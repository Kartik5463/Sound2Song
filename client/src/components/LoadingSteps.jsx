import { Check, Loader2 } from 'lucide-react'

// The server answers in one go, so for links these are estimates based on typical timings
// (~4 s to look up the video, ~2 s to download, ~1 s per recognition check). For uploads
// the first step follows the real upload progress.
const LINK_STEPS = ['Looking up the video', 'Downloading and cleaning the audio', 'Listening for songs']
const UPLOAD_STEPS = ['Uploading the file', 'Cleaning the audio and finding song changes', 'Listening for songs']

function currentStep({ kind, elapsed, uploadProgress, uploadDoneAt }) {
  if (kind === 'upload') {
    if (uploadProgress < 1 || uploadDoneAt == null) return 0
    return elapsed - uploadDoneAt < 2 ? 1 : 2
  }
  return elapsed < 4 ? 0 : elapsed < 7 ? 1 : 2
}

/** Progress list shown while a video or file is being analyzed. */
export default function LoadingSteps({ kind = 'link', elapsed, uploadProgress = 0, uploadDoneAt = null }) {
  const steps = kind === 'upload' ? UPLOAD_STEPS : LINK_STEPS
  const current = currentStep({ kind, elapsed, uploadProgress, uploadDoneAt })

  return (
    <div className="card p-6" aria-live="polite">
      <h3 className="mb-4 font-display text-xl font-bold text-latte-950">Finding your songs…</h3>
      <ol className="space-y-3">
        {steps.map((label, i) => {
          const done = i < current
          const active = i === current
          return (
            <li
              key={label}
              className={`flex items-center gap-3 text-sm font-medium ${done || active ? 'text-latte-900' : 'text-latte-400'}`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${
                  done ? 'bg-olive-500/15 text-olive-600' : active ? 'bg-latte-700 text-white shadow-md' : 'bg-latte-100 text-latte-500'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
              </span>
              {label}
              {active && kind === 'upload' && i === 0 && (
                <span className="text-xs text-latte-500">{Math.round(uploadProgress * 100)}%</span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-5 rounded-xl bg-latte-50 px-3 py-2 text-xs text-latte-600 ring-1 ring-latte-200">
        {elapsed}s
        {elapsed >= 20
          ? ' · The recognition service only allows a few requests per minute, so we are waiting for a free slot. This can take up to 2 minutes.'
          : ' · Usually takes 5–15 seconds.'}
      </p>
    </div>
  )
}
