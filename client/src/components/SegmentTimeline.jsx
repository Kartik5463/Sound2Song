import { formatTime } from '../utils/format'

/** A bar across the whole video: silent parts striped grey, each audio segment as a coloured block. */
export default function SegmentTimeline({ duration, segments, silence }) {
  const pct = (t) => `${(t / duration) * 100}%`

  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-lg bg-slate-800">
        {silence.map((s, i) => (
          <div
            key={`s${i}`}
            title={`Silence ${formatTime(s.start)}–${formatTime(s.end)}`}
            className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#334155_0_4px,#1e293b_4px_8px)]"
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
          />
        ))}
        {segments.map((seg) => (
          <div
            key={seg.index}
            title={`Segment ${seg.index + 1}: ${formatTime(seg.start)}–${formatTime(seg.end)}`}
            className="absolute inset-y-1 rounded-sm border-r-2 border-slate-900 bg-gradient-to-b from-sky-400 to-violet-500 opacity-90 hover:opacity-100"
            style={{ left: pct(seg.start), width: pct(seg.end - seg.start) }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
