import { RefreshCw, SearchX } from 'lucide-react'
import SongCard from './SongCard'
import SegmentTimeline from './SegmentTimeline'
import { formatTime } from '../utils/format'
import { songColorMap } from '../utils/songColors'

const checkedCount = (segments) =>
  segments.filter((s) => !s.status || ['matched', 'no_match', 'failed'].includes(s.status)).length

function VideoHeader({ result, onRefresh, refreshing }) {
  return (
    <div className="flex gap-4">
      {result.thumbnail && (
        <img src={result.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold" title={result.title}>
          {result.title}
        </h2>
        <p className="text-sm text-slate-400">
          {result.channel} · {formatTime(result.duration)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {result.cached ? 'Saved result' : `Analyzed in ${result.timings?.total ?? '?'}s`} ·{' '}
          {checkedCount(result.segments)} of {result.segments.length} clips checked
          {result.cached && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="ml-2 inline-flex items-center gap-1 text-sky-400 hover:underline disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Analyze again
            </button>
          )}
        </p>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <div>
        <h3 className="font-semibold">No song recognized</h3>
        <p className="mt-1 text-sm text-slate-400">
          The music may be too quiet under speech, heavily edited (sped up or pitch-shifted), or not in
          Shazam's catalogue.
        </p>
      </div>
    </div>
  )
}

/** Everything shown after a video has been analyzed. */
export default function ResultView({ result, onRefresh, refreshing }) {
  const colors = songColorMap(result.songs)
  const count = result.songs.length

  return (
    <section className="mt-8 space-y-4">
      <VideoHeader result={result} onRefresh={onRefresh} refreshing={refreshing} />

      {count > 1 && <h2 className="pt-2 text-lg font-semibold">{count} songs found in this video</h2>}
      {count === 0 && <NotFound />}

      {result.songs.map((song) => (
        <SongCard
          key={song.key}
          song={song}
          color={colors[song.key]}
          videoUrl={result.url}
          videoDuration={result.duration}
        />
      ))}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Timeline</h3>
        <SegmentTimeline
          duration={result.duration}
          segments={result.segments}
          silence={result.silence}
          songs={result.songs}
          colors={colors}
        />
      </div>
    </section>
  )
}
