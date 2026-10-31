import { Check, Loader2 } from 'lucide-react'

// The server answers in one go, so these are estimates based on typical timings:
// ~4 s to look up the video, ~2 s to download, ~1 s per recognition check.
const STEPS = [
  { label: 'Looking up the video', until: 4 },
  { label: 'Downloading and cleaning the audio', until: 7 },
  { label: 'Listening for songs', until: Infinity },
]

/** Progress list shown while a video is being analyzed. */
export default function LoadingSteps({ elapsed }) {
  const current = STEPS.findIndex((s) => elapsed < s.until)

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5" aria-live="polite">
      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={step.label} className={`flex items-center gap-3 text-sm ${done || active ? 'text-slate-200' : 'text-slate-500'}`}>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full ${
                  done ? 'bg-emerald-500/20 text-emerald-300' : active ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
              </span>
              {step.label}
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-xs text-slate-500">
        {elapsed}s
        {elapsed >= 20
          ? ' · The recognition service only allows a few requests per minute, so we are waiting for a free slot. This can take up to 2 minutes.'
          : ' · Usually takes 5–15 seconds.'}
      </p>
    </div>
  )
}
