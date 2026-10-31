import { useState } from 'react'
import { Link2, Loader2, ClipboardPaste, X } from 'lucide-react'

/** URL input with Paste / Clear helpers and the Identify button. */
export default function SearchForm({ url, onUrlChange, onSubmit, loading }) {
  const [canPaste] = useState(() => Boolean(navigator.clipboard?.readText))

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) onUrlChange(text)
    } catch {
      // Permission denied: the user can still paste with Ctrl+V
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2 focus-within:border-sky-500/60 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-1 items-center gap-2 px-2">
        <Link2 className="h-4 w-4 shrink-0 text-slate-500" />
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="Paste a YouTube, Shorts or YouTube Music link…"
          aria-label="YouTube URL"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent py-2 outline-none placeholder:text-slate-500"
        />
        {url ? (
          <button
            type="button"
            onClick={() => onUrlChange('')}
            aria-label="Clear"
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          canPaste && (
            <button
              type="button"
              onClick={paste}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
          )
        )}
      </div>
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2 font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Identifying…' : 'Identify Song'}
      </button>
    </form>
  )
}
