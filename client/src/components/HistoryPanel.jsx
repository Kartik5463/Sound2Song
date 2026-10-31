import { History, Music2, X, Trash2, ChevronRight, FileAudio } from 'lucide-react'
import { timeAgo } from '../utils/timeAgo'

function HistoryItem({ item, active, onOpen, onRemove }) {
  const image = item.song?.coverUrl || item.thumbnail
  const title = item.song ? item.song.title : item.videoTitle
  const subtitle = item.song
    ? item.song.artist +
      (item.songCount > 1 ? ` · +${item.songCount - 1} more` : '') +
      (item.song.mashup ? ' · mashup' : '')
    : 'No song recognized'

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(item.videoId)}
        className={`flex w-full items-center gap-3 rounded-xl p-2 pr-8 text-left transition hover:bg-latte-100 ${
          active ? 'bg-latte-100 ring-1 ring-latte-300' : ''
        }`}
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-latte-100 shadow-sm ring-1 ring-latte-200">
          {image ? (
            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : item.source === 'upload' ? (
            <FileAudio className="m-3 h-5 w-5 text-latte-600" />
          ) : (
            <Music2 className="m-3 h-5 w-5 text-latte-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-latte-950" title={title}>
            {title}
          </div>
          <div className={`truncate text-xs ${item.song ? 'text-latte-700' : 'text-latte-400'}`}>{subtitle}</div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-latte-500">{timeAgo(item.searchedAt)}</div>
        <ChevronRight className="h-4 w-4 shrink-0 text-latte-400 group-hover:hidden pointer-coarse:hidden" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.videoId)}
        aria-label={`Remove ${title} from history`}
        title="Remove from history"
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-lg p-1 text-latte-500 hover:bg-latte-200 hover:text-latte-900 focus:block group-hover:block pointer-coarse:block pointer-coarse:p-2"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

/** This browser's recent searches. Clicking one opens the saved result instantly. */
export default function HistoryPanel({ items, loading, error, activeVideoId, onOpen, onRemove, onClear }) {
  return (
    <aside className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-latte-950">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-latte-100 text-latte-700">
            <History className="h-4 w-4" />
          </span>
          Search history
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-latte-600 hover:bg-latte-100 hover:text-latte-900"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {loading && items.length === 0 && (
        <ul className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 p-2">
              <div className="h-11 w-11 animate-pulse rounded-lg bg-latte-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-latte-100" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-latte-100" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="px-2 py-3 text-sm text-latte-500">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-latte-300 px-4 py-6 text-center text-sm text-latte-500">
          Songs you identify from links or files will show up here.
        </div>
      )}

      {items.length > 0 && (
        <ul className="-mx-1 max-h-[28rem] space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <HistoryItem
              key={item.videoId}
              item={item}
              active={item.videoId === activeVideoId}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}
