import { useCallback, useEffect, useRef, useState } from 'react'
import { Music, AlertCircle, Link2, AudioLines, Sparkles } from 'lucide-react'
import {
  getHealth,
  identifySong,
  getSavedResult,
  getHistory,
  deleteHistoryItem,
  clearHistory,
  errorMessage,
} from './api/client'
import { extractVideoId } from './utils/youtube'
import StatusBadge from './components/StatusBadge'
import ResultView from './components/ResultView'
import SearchForm from './components/SearchForm'
import LoadingSteps from './components/LoadingSteps'
import HistoryPanel from './components/HistoryPanel'

/** Keep ?v=<videoId> in the address bar so a result can be shared or reloaded. */
function setUrlVideo(videoId) {
  const url = new URL(window.location.href)
  if (videoId) url.searchParams.set('v', videoId)
  else url.searchParams.delete('v')
  window.history.replaceState(null, '', url)
}

function HowItWorks() {
  const steps = [
    { icon: Link2, title: 'Paste a link', text: 'Any YouTube video, Short or YouTube Music track up to 15 minutes.' },
    { icon: AudioLines, title: 'We listen', text: 'The audio is cleaned up and a few clips are checked against Shazam.' },
    { icon: Sparkles, title: 'Get the song', text: 'Title, artist, album, where it plays in the video, and a preview.' },
  ]
  return (
    <section className="mt-8 grid gap-3 sm:grid-cols-3">
      {steps.map(({ icon: Icon, title, text }, i) => (
        <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-500/15 text-xs text-sky-300">{i + 1}</span>
            <Icon className="h-4 w-4 text-slate-400" />
            {title}
          </div>
          <p className="mt-2 text-sm text-slate-400">{text}</p>
        </div>
      ))}
    </section>
  )
}

const sharedVideoId = () => new URLSearchParams(window.location.search).get('v')
const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`

export default function App() {
  const [url, setUrl] = useState(() => (sharedVideoId() ? watchUrl(sharedVideoId()) : ''))
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState({ items: [], loading: true, error: '' })
  const timer = useRef(null)

  const checkHealth = useCallback(
    () =>
      getHealth()
        .then(setHealth)
        .catch(() => setHealth({ server: 'down', database: 'down', audioService: 'down' })),
    [],
  )

  const loadHistory = useCallback(() => {
    getHistory()
      .then((items) => setHistory({ items, loading: false, error: '' }))
      .catch((err) => setHistory((h) => ({ ...h, loading: false, error: errorMessage(err) })))
  }, [])

  const showResult = useCallback((data) => {
    setResult(data)
    setUrlVideo(data?.videoId)
  }, [])

  /** Open a saved result (history item or shared ?v= link) without analyzing again. */
  const openSaved = useCallback(
    async (videoId) => {
      setError('')
      setUrl(watchUrl(videoId))
      try {
        showResult(await getSavedResult(videoId))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [showResult],
  )

  useEffect(() => {
    checkHealth()
    loadHistory()
    const shared = sharedVideoId()
    if (shared) {
      getSavedResult(shared)
        .then(showResult)
        .catch((err) => setError(errorMessage(err)))
    }
    return () => clearInterval(timer.current)
  }, [checkHealth, loadHistory, showResult])

  async function run(videoUrl, { refresh = false } = {}) {
    setError('')
    setLoading(true)
    if (!refresh) showResult(null)
    setElapsed(0)
    const started = Date.now()
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)

    try {
      showResult(await identifySong(videoUrl, { refresh }))
      loadHistory()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      clearInterval(timer.current)
      setLoading(false)
      checkHealth() // keep the status badges current
    }
  }

  function handleSubmit() {
    if (!extractVideoId(url)) {
      setError("That doesn't look like a valid YouTube video URL.")
      return
    }
    run(url)
  }

  async function removeFromHistory(videoId) {
    setHistory((h) => ({ ...h, items: h.items.filter((i) => i.videoId !== videoId) }))
    try {
      await deleteHistoryItem(videoId)
    } catch {
      loadHistory() // put it back if the delete failed
    }
  }

  async function clearAllHistory() {
    if (!window.confirm('Clear your whole search history?')) return
    setHistory((h) => ({ ...h, items: [] }))
    try {
      await clearHistory()
    } catch {
      loadHistory()
    }
  }

  const status = (key) => (health ? health[key] : 'loading')

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-blue-500 to-violet-600">
          <Music className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            YouTube <span className="text-sky-400">Song Identifier</span>
          </h1>
          <p className="text-slate-400">Paste a YouTube URL and find out which song is playing.</p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">
          <SearchForm url={url} onUrlChange={setUrl} onSubmit={handleSubmit} loading={loading} />

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {loading && !result && <LoadingSteps elapsed={elapsed} />}

          {result && (
            <ResultView
              result={result}
              refreshing={loading}
              onRefresh={() => run(result.url, { refresh: true })}
            />
          )}

          {!result && !loading && <HowItWorks />}
        </main>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <HistoryPanel
            items={history.items}
            loading={history.loading}
            error={history.error}
            activeVideoId={result?.videoId}
            onOpen={openSaved}
            onRemove={removeFromHistory}
            onClear={clearAllHistory}
          />
        </div>
      </div>

      <footer className="mt-12 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-6 text-xs text-slate-500">
        <StatusBadge label="API" status={status('server')} />
        <StatusBadge label="Database" status={status('database')} />
        <StatusBadge label="Audio service" status={status('audioService')} />
        <span className="ml-auto">Song data from Shazam and iTunes.</span>
      </footer>
    </div>
  )
}
