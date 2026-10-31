import { History, Music2, X, Trash2, ChevronRight } from 'lucide-react'
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
        className={`flex w-full items-center gap-3 rounded-lg p-2 pr-8 text-left transition hover:bg-slate-800/70 ${
          active ? 'bg-slate-800' : ''
        }`}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-800">
          {image ? (
            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Music2 className="m-2.5 h-5 w-5 text-slate-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={title}>
            {title}
          </div>
          <div className={`truncate text-xs ${item.song ? 'text-sky-300/80' : 'text-slate-500'}`}>{subtitle}</div>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">{timeAgo(item.searchedAt)}</div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:hidden" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.videoId)}
        aria-label={`Remove ${title} from history`}
        title="Remove from history"
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100 focus:block group-hover:block"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

/** This browser's recent searches. Clicking one opens the saved result instantly. */
export default function HistoryPanel({ items, loading, error, activeVideoId, onOpen, onRemove, onClear }) {
  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-slate-400" /> Search history
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {loading && items.length === 0 && (
        <ul className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 p-2">
              <div className="h-10 w-10 animate-pulse rounded-md bg-slate-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-800" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="px-2 py-3 text-sm text-slate-500">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="px-2 py-3 text-sm text-slate-500">Songs you identify will show up here.</p>
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
