import { useEffect, useRef, useState } from 'react'
import { Music, Link2, Loader2, AlertCircle } from 'lucide-react'
import { getHealth, identifySong, errorMessage } from './api/client'
import { extractVideoId } from './utils/youtube'
import StatusBadge from './components/StatusBadge'
import AudioPreview from './components/AudioPreview'

export default function App() {
  const [url, setUrl] = useState('')
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth({ server: 'down', database: 'down', audioService: 'down' }))
    return () => clearInterval(timer.current)
  }, [])

  const status = (key) => (health ? health[key] : 'loading')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!extractVideoId(url)) {
      setError("That doesn't look like a valid YouTube video URL.")
      return
    }

    setLoading(true)
    setResult(null)
    setElapsed(0)
    const started = Date.now()
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)

    try {
      setResult(await identifySong(url))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      clearInterval(timer.current)
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600">
          <Music className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            YouTube <span className="text-sky-400">Song Identifier</span>
          </h1>
          <p className="text-slate-400">Paste a YouTube URL and find out which song is playing.</p>
        </div>
      </header>

      <form
        className="mt-10 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2 sm:flex-row"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-1 items-center gap-2 px-2">
          <Link2 className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            aria-label="YouTube URL"
            className="w-full bg-transparent py-2 outline-none placeholder:text-slate-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2 font-medium transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Processing…' : 'Identify Song'}
        </button>
      </form>

      {loading && (
        <p className="mt-4 text-sm text-slate-400">
          Downloading and processing audio… {elapsed}s
          <span className="text-slate-500"> (usually 10–60 seconds, depending on video length)</span>
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && <AudioPreview result={result} />}

      <section className="mt-10 flex flex-wrap gap-2">
        <StatusBadge label="API" status={status('server')} />
        <StatusBadge label="Database" status={status('database')} />
        <StatusBadge label="Audio service" status={status('audioService')} />
      </section>
    </div>
  )
}
