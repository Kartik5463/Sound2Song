import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, UploadCloud, CheckCircle2, ArrowLeft } from 'lucide-react'
import {
  getHealth,
  identifySong,
  identifyUpload,
  getSavedResult,
  getHistory,
  deleteHistoryItem,
  clearHistory,
  errorMessage,
} from './api/client'
import { extractVideoId } from './utils/youtube'
import { checkFile } from './utils/files'
import StatusBadge from './components/StatusBadge'
import ResultView from './components/ResultView'
import InputCard from './components/InputCard'
import LoadingSteps from './components/LoadingSteps'
import HistoryPanel from './components/HistoryPanel'
import { HeroPreview, StatsStrip, HowItWorks, Features, TipsCard } from './components/Landing'

/** Keep ?v=<id> in the address bar so a result can be shared or reloaded. */
function setUrlVideo(id) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('v', id)
  else url.searchParams.delete('v')
  window.history.replaceState(null, '', url)
}

const sharedId = () => new URLSearchParams(window.location.search).get('v')
const isUploadId = (id) => id?.startsWith('up_')
const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`

function Logo() {
  // Same artwork as the favicon, so the tab icon and the page logo match
  return <img src="/favicon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-latte-700/30" />
}

function NavBar({ onHome, allOk }) {
  return (
    <nav className="sticky top-0 z-40 border-b border-latte-200/80 bg-latte-50/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <button type="button" onClick={onHome} className="flex items-center gap-2.5 text-left">
          <Logo />
          <span className="leading-tight">
            <span className="block font-display text-lg font-bold text-latte-950">Sound2Song</span>
            <span className="hidden text-[11px] font-medium text-latte-500 min-[380px]:block">YouTube Song Identifier</span>
          </span>
        </button>
        <div className="ml-auto hidden items-center gap-1 text-sm font-medium text-latte-700 md:flex">
          <a href="#how" onClick={onHome} className="rounded-lg px-3 py-1.5 hover:bg-latte-100">
            How it works
          </a>
          <a href="#features" onClick={onHome} className="rounded-lg px-3 py-1.5 hover:bg-latte-100">
            Features
          </a>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 md:ml-2 ${
            allOk === false
              ? 'bg-terracotta-500/10 text-terracotta-600 ring-terracotta-500/25'
              : 'bg-olive-500/10 text-olive-600 ring-olive-500/25'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          {allOk === false ? 'Service issue' : 'Online'}
        </span>
      </div>
    </nav>
  )
}

function Footer({ status }) {
  return (
    <footer className="mt-16 border-t border-latte-200 bg-latte-50/70">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-lg font-bold text-latte-950">Sound2Song</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-latte-600">
            Turn any YouTube video or audio file into song names. Song data from Shazam and iTunes. Uploaded files
            are deleted right after analysis.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-latte-900">Works with</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-latte-600">
            <li>YouTube videos, Shorts and Music</li>
            <li>MP3, WAV, M4A, FLAC, OGG</li>
            <li>MP4, MOV, MKV, WEBM</li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-latte-900">Service status</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label="API" status={status('server')} />
            <StatusBadge label="Database" status={status('database')} />
            <StatusBadge label="Audio service" status={status('audioService')} />
          </div>
          <p className="mt-3 text-xs text-latte-500">Built with MongoDB, Express, React, Node.js and Python.</p>
        </div>
      </div>
    </footer>
  )
}

function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-latte-100/85 backdrop-blur-sm">
      <div className="card mx-4 flex flex-col items-center gap-3 border-2 border-dashed border-latte-500 px-8 py-10 text-center sm:px-16 sm:py-12">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-latte-700 text-white">
          <UploadCloud className="h-7 w-7" />
        </span>
        <p className="font-display text-2xl font-bold text-latte-950">Drop your audio or video file</p>
        <p className="text-sm text-latte-600">We'll find the songs in it</p>
      </div>
    </div>
  )
}

function ErrorBox({ message }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-2xl border border-terracotta-500/30 bg-terracotta-500/10 px-4 py-3 text-sm font-medium text-terracotta-600"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState('link') // 'link' | 'upload'
  const [url, setUrl] = useState(() => {
    const id = sharedId()
    return id && !isUploadId(id) ? watchUrl(id) : ''
  })
  const [file, setFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDoneAt, setUploadDoneAt] = useState(null)
  const [task, setTask] = useState(null) // kind of the running analysis: 'link' | 'upload'
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [health, setHealth] = useState(null)
  const [history, setHistory] = useState({ items: [], loading: true, error: '' })
  const [dragging, setDragging] = useState(false)
  const timer = useRef(null)
  const elapsedRef = useRef(0)
  const loading = task !== null

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
    if (data?.source === 'upload') setMode('upload') // match the input to what is shown
  }, [])

  /** Choose a file for upload (from the picker, a drop anywhere on the page, or a paste). */
  const chooseFile = useCallback((f) => {
    setMode('upload')
    if (!f) return setFile(null)
    const problem = checkFile(f)
    setError(problem ?? '')
    setFile(problem ? null : f)
  }, [])

  /** Open a saved result (history item or shared ?v= link) without analyzing again. */
  const openSaved = useCallback(
    async (id) => {
      setError('')
      if (!isUploadId(id)) {
        setMode('link')
        setUrl(watchUrl(id))
      }
      try {
        showResult(await getSavedResult(id))
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
    const id = sharedId()
    if (id) {
      getSavedResult(id)
        .then(showResult)
        .catch((err) => setError(errorMessage(err)))
    }
    return () => clearInterval(timer.current)
  }, [checkHealth, loadHistory, showResult])

  // Drop a file anywhere on the page, or paste a link/file anywhere (outside text fields)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const onEnter = (e) => {
      if (!hasFiles(e)) return
      depth += 1
      setDragging(true)
    }
    const onLeave = (e) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e) => hasFiles(e) && e.preventDefault()
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (!task && e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0])
    }
    const onPaste = (e) => {
      if (task || e.target.closest?.('input, textarea, [contenteditable]')) return
      const pastedFile = e.clipboardData?.files?.[0]
      if (pastedFile) return chooseFile(pastedFile)
      const text = e.clipboardData?.getData('text')?.trim()
      if (text && extractVideoId(text)) {
        setMode('link')
        setUrl(text)
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [task, chooseFile])

  /** Run one analysis (link or upload) with the shared loading/error handling. */
  async function runTask(kind, work, { refresh = false } = {}) {
    setError('')
    setTask(kind)
    if (!refresh) showResult(null)
    setElapsed(0)
    elapsedRef.current = 0
    setUploadProgress(0)
    setUploadDoneAt(null)
    const started = Date.now()
    timer.current = setInterval(() => {
      elapsedRef.current = Math.floor((Date.now() - started) / 1000)
      setElapsed(elapsedRef.current)
    }, 1000)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    try {
      showResult(await work())
      loadHistory()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      clearInterval(timer.current)
      setTask(null)
      checkHealth() // keep the status badges current
    }
  }

  function submitLink(link = url, options) {
    if (!extractVideoId(link)) {
      setError("That doesn't look like a valid YouTube video URL.")
      return
    }
    runTask('link', () => identifySong(link, options), options)
  }

  function submitFile(options) {
    const problem = checkFile(file)
    if (problem) return setError(problem)
    runTask(
      'upload',
      () =>
        identifyUpload(file, {
          ...options,
          onProgress: (p) => {
            setUploadProgress(p)
            if (p >= 1) setUploadDoneAt((at) => at ?? elapsedRef.current)
          },
        }),
      options,
    )
  }

  async function removeFromHistory(id) {
    setHistory((h) => ({ ...h, items: h.items.filter((i) => i.videoId !== id) }))
    try {
      await deleteHistoryItem(id)
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

  function goHome() {
    if (loading) return
    showResult(null)
    setError('')
  }

  // "Analyze again" needs the original file for uploads, so only offer it while we have it
  const isUploadResult = result?.source === 'upload'
  const canRefresh = !isUploadResult || (file && file.name === result.fileName)
  const refresh = () =>
    isUploadResult ? submitFile({ refresh: true }) : submitLink(result.url, { refresh: true })

  const status = (key) => (health ? health[key] : 'loading')
  const allOk = health ? ['server', 'database', 'audioService'].every((k) => health[k] === 'ok') : null
  const showingWork = Boolean(result || loading)

  const inputCard = (
    <InputCard
      mode={mode}
      onModeChange={(m) => {
        setMode(m)
        setError('')
      }}
      loading={loading}
      showExamples={!url && !showingWork}
      link={{
        url,
        onUrlChange: setUrl,
        onSubmit: () => submitLink(),
        onExample: (example) => {
          setUrl(example)
          submitLink(example)
        },
      }}
      upload={{ file, onFile: chooseFile, onSubmit: () => submitFile(), progress: uploadProgress }}
    />
  )

  const sidebar = (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:sticky lg:top-24 lg:grid-cols-1 lg:self-start">
      <HistoryPanel
        items={history.items}
        loading={history.loading}
        error={history.error}
        activeVideoId={result?.videoId}
        onOpen={openSaved}
        onRemove={removeFromHistory}
        onClear={clearAllHistory}
      />
      <TipsCard />
    </div>
  )

  return (
    // overflow-x-clip: decorative glows may extend past the edge; never let them cause sideways
    // scrolling on phones (unlike overflow-hidden, clip keeps the sticky navbar working)
    <div className="min-h-screen overflow-x-clip">
      {dragging && <DropOverlay />}
      <NavBar onHome={goHome} allOk={allOk} />

      {showingWork ? (
        /* ---------- Working / results layout ---------- */
        <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {!loading && (
            <button
              type="button"
              onClick={goHome}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-latte-600 hover:text-latte-900"
            >
              <ArrowLeft className="h-4 w-4" /> New search
            </button>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 space-y-5">
              {inputCard}
              {error && <ErrorBox message={error} />}
              {loading && !result && (
                <LoadingSteps kind={task} elapsed={elapsed} uploadProgress={uploadProgress} uploadDoneAt={uploadDoneAt} />
              )}
              {result && <ResultView result={result} canRefresh={canRefresh} refreshing={loading} onRefresh={refresh} />}
            </main>
            {sidebar}
          </div>
        </div>
      ) : (
        /* ---------- Landing layout ---------- */
        <>
          <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-10 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pt-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-latte-700 shadow-sm ring-1 ring-latte-200">
                <span className="h-1.5 w-1.5 rounded-full bg-honey-500" /> Free · No sign-up · Shorts, mashups & files
              </span>
              <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-[1.1] text-latte-950 min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
                Find the song in{' '}
                <span className="bg-linear-to-r from-latte-600 via-honey-500 to-latte-800 bg-clip-text text-transparent">
                  any video
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-latte-700 sm:text-lg">
                Paste a YouTube link or upload an audio or video file. We listen to it and tell you the song name,
                artist, album and exactly where each song plays.
              </p>
              <div className="mt-6">{inputCard}</div>
              {error && <ErrorBox message={error} />}
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-latte-700">
                {['Works with Shorts', 'Finds multiple songs', 'Detects mashups'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-olive-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </section>

          <div className="mx-auto max-w-7xl space-y-12 px-4">
            <StatsStrip />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <main className="min-w-0 space-y-12">
                <HowItWorks />
                <Features />
              </main>
              {sidebar}
            </div>
          </div>
        </>
      )}

      <Footer status={status} />
    </div>
  )
}
