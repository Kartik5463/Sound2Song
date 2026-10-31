import { Clock, Layers, VolumeX, Timer } from 'lucide-react'
import SegmentTimeline from './SegmentTimeline'
import { formatTime } from '../utils/format'

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-800/60 px-3 py-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

/** Shows what the audio pipeline produced for a video (Phase 2 result). */
export default function AudioPreview({ result }) {
  const { title, channel, thumbnail, duration, segments, silence, timings } = result
  const silentSeconds = silence.reduce((sum, s) => sum + (s.end - s.start), 0)

  return (
    <article className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex gap-4">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-20 w-36 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0">
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300 ring-1 ring-sky-500/30">
            Audio ready
          </span>
          <h2 className="mt-2 truncate text-lg font-semibold" title={title}>
            {title}
          </h2>
          <p className="text-sm text-slate-400">{channel}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={Clock} label="Duration" value={formatTime(duration)} />
        <Stat icon={Layers} label="Segments" value={segments.length} />
        <Stat icon={VolumeX} label="Silence skipped" value={`${Math.round(silentSeconds)}s`} />
        <Stat icon={Timer} label="Processed in" value={`${timings.total}s`} />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-medium text-slate-300">Audio segments</h3>
      <SegmentTimeline duration={duration} segments={segments} silence={silence} />

      <p className="mt-4 text-xs text-slate-500">
        Each segment will be sent for song recognition in Phase 3.
      </p>
    </article>
  )
}
