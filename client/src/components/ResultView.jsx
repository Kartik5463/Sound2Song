import { useState } from 'react'
import { RefreshCw, SearchX, Link as LinkIcon, Check, FileAudio, ExternalLink, Clock, Layers, Timer, ListMusic } from 'lucide-react'
import SongCard from './SongCard'
import SegmentTimeline from './SegmentTimeline'
import { formatTime } from '../utils/format'
import { formatSize } from '../utils/files'
import { songColorMap } from '../utils/songColors'

const checkedCount = (segments) =>
  segments.filter((s) => !s.status || ['matched', 'no_match', 'failed'].includes(s.status)).length

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the address bar still has the link
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost">
      {copied ? <Check className="h-3.5 w-3.5 text-olive-600" /> : <LinkIcon className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-latte-50 px-3 py-2 ring-1 ring-latte-200">
      <Icon className="h-4 w-4 text-latte-500" />
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-latte-500">{label}</div>
        <div className="text-sm font-semibold text-latte-900">{value}</div>
      </div>
    </div>
  )
}

function SourceHeader({ result, canRefresh, onRefresh, refreshing }) {
  const isUpload = result.source === 'upload'
  const subtitle = isUpload
    ? ['Uploaded file', result.fileSize ? formatSize(result.fileSize) : null].filter(Boolean).join(' · ')
    : result.channel

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {isUpload ? (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-latte-100 text-latte-700 ring-1 ring-latte-200">
            <FileAudio className="h-8 w-8" />
          </div>
        ) : (
          result.thumbnail && (
            <img src={result.thumbnail} alt="" className="h-20 w-36 shrink-0 rounded-2xl object-cover shadow-md ring-1 ring-latte-200" />
          )
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-latte-950" title={result.title}>
            {result.title}
          </h2>
          <p className="text-sm text-latte-600">{subtitle}</p>
          <p className="mt-1 text-xs text-latte-500">
            {result.cached ? 'Saved result' : 'Just analyzed'}
            {result.cached && canRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="ml-2 inline-flex items-center gap-1 font-semibold text-latte-700 hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" /> Analyze again
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isUpload && result.url && (
            <a href={result.url} target="_blank" rel="noreferrer" className="btn-ghost">
              <ExternalLink className="h-3.5 w-3.5" /> YouTube
            </a>
          )}
          <CopyLinkButton />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
        <Stat icon={ListMusic} label="Songs found" value={result.songs.length} />
        <Stat icon={Clock} label="Length" value={formatTime(result.duration)} />
        <Stat icon={Layers} label="Clips checked" value={`${checkedCount(result.segments)} of ${result.segments.length}`} />
        <Stat icon={Timer} label="Analyzed in" value={result.timings?.total ? `${result.timings.total}s` : '—'} />
      </div>
    </div>
  )
}

function NotFound({ isUpload }) {
  return (
    <div className="card flex items-start gap-4 p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-latte-100 text-latte-600">
        <SearchX className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-display text-xl font-bold text-latte-950">No song recognized</h3>
        <p className="mt-1 text-sm text-latte-600">
          The music may be too quiet under speech, heavily edited (sped up or pitch-shifted), or not in
          Shazam's catalogue.
          {isUpload && ' Recordings made with a phone near a speaker work best when the music is clear and loud.'}
        </p>
      </div>
    </div>
  )
}

/** Everything shown after a video or file has been analyzed. */
export default function ResultView({ result, canRefresh = true, onRefresh, refreshing }) {
  const colors = songColorMap(result.songs)
  const count = result.songs.length
  const isUpload = result.source === 'upload'

  return (
    <section className="space-y-5">
      <SourceHeader result={result} canRefresh={canRefresh} onRefresh={onRefresh} refreshing={refreshing} />

      {count > 1 && (
        <h2 className="pt-1 font-display text-2xl font-bold text-latte-950">
          {count} songs found in this {isUpload ? 'file' : 'video'}
        </h2>
      )}
      {count === 0 && <NotFound isUpload={isUpload} />}

      {result.songs.map((song) => (
        <SongCard
          key={song.key}
          song={song}
          color={colors[song.key]}
          videoUrl={isUpload ? null : result.url}
          videoDuration={result.duration}
        />
      ))}

      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-latte-900">Timeline</h3>
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
