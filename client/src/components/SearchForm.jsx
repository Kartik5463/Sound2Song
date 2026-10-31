import { useState } from 'react'
import { Link2, Loader2, ClipboardPaste, X, Search } from 'lucide-react'

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
      className="flex flex-col gap-2 rounded-2xl border border-latte-300 bg-white p-2 shadow-inner shadow-latte-200/60 transition focus-within:border-latte-500 focus-within:ring-4 focus-within:ring-latte-300/40 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-1 items-center gap-2 px-2">
        <Link2 className="h-4 w-4 shrink-0 text-latte-500" />
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="Paste a YouTube, Shorts or YouTube Music link…"
          aria-label="YouTube URL"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent py-2.5 text-latte-950 outline-none placeholder:text-latte-400"
        />
        {url ? (
          <button
            type="button"
            onClick={() => onUrlChange('')}
            aria-label="Clear"
            className="rounded-lg p-1 text-latte-400 hover:bg-latte-100 hover:text-latte-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          canPaste && (
            <button
              type="button"
              onClick={paste}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-latte-600 hover:bg-latte-100"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
          )
        )}
      </div>
      <button type="submit" disabled={loading || !url.trim()} className="btn-primary">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {loading ? 'Identifying…' : 'Identify Song'}
      </button>
    </form>
  )
}
