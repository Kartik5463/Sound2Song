import { formatTime } from '../utils/format'

const STRIPES = 'repeating-linear-gradient(45deg,#e2cbb0 0 4px,#f8f0e5 4px 8px)'
const NO_MATCH = '#cfae8a'
const FAILED = '#c0583f'

/** How each segment is drawn, based on what recognition found there. */
function segmentStyle(seg, colors) {
  const songColor = seg.songKey ? colors[seg.songKey] : null
  switch (seg.status) {
    case 'matched':
      return { background: songColor }
    case 'inferred':
      return { background: songColor, opacity: 0.45 }
    case 'failed':
      return { background: FAILED }
    case 'skipped':
      return { background: '#fffaf3', boxShadow: 'inset 0 0 0 1px #e2cbb0' }
    default:
      // no_match, or results saved before statuses existed
      return { background: songColor ?? NO_MATCH }
  }
}

function describe(seg, titleOf) {
  const song = seg.songKey ? titleOf[seg.songKey] : null
  switch (seg.status) {
    case 'matched':
      return `${song} (checked)`
    case 'inferred':
      return `${song} (between two matching checks)`
    case 'failed':
      return 'Check failed'
    case 'skipped':
      return 'Not checked'
    default:
      return song ?? 'Checked, no match'
  }
}

function Legend({ color, style, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded" style={style ?? { background: color }} />
      {children}
    </span>
  )
}

/**
 * A bar across the whole video showing where each song plays. Solid blocks are clips
 * that were checked and matched; lighter blocks are between two checks of the same song.
 */
export default function SegmentTimeline({ duration, segments, silence, songs = [], colors = {} }) {
  const pct = (t) => `${(t / duration) * 100}%`
  const titleOf = Object.fromEntries(songs.map((s) => [s.key, `${s.title} – ${s.artist}`]))
  const has = (status) => segments.some((s) => s.status === status)

  return (
    <div>
      <div className="relative h-12 overflow-hidden rounded-xl bg-latte-50 ring-1 ring-latte-200">
        {silence.map((s, i) => (
          <div
            key={`s${i}`}
            title={`Silence ${formatTime(s.start)}–${formatTime(s.end)}`}
            className="absolute inset-y-0"
            style={{ left: pct(s.start), width: pct(s.end - s.start), background: STRIPES }}
          />
        ))}
        {segments.map((seg) => (
          <div
            key={seg.index}
            title={`${formatTime(seg.start)}–${formatTime(seg.end)}: ${describe(seg, titleOf)}`}
            className="absolute inset-y-1.5 rounded-md border-x border-white"
            style={{ left: pct(seg.start), width: pct(seg.end - seg.start), ...segmentStyle(seg, colors) }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-medium text-latte-500">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-latte-700">
        {songs.map((s) => (
          <Legend key={s.key} color={colors[s.key]}>
            {s.title}
          </Legend>
        ))}
        {has('no_match') && <Legend color={NO_MATCH}>No match</Legend>}
        {has('skipped') && (
          <Legend style={{ background: '#fffaf3', boxShadow: 'inset 0 0 0 1px #cfae8a' }}>Not checked</Legend>
        )}
        {has('failed') && <Legend color={FAILED}>Check failed</Legend>}
        {silence.length > 0 && <Legend style={{ background: STRIPES }}>Silence</Legend>}
      </div>
      {has('inferred') && (
        <p className="mt-2 text-xs text-latte-500">
          Lighter blocks weren't checked individually: they sit between two checks that found the same song.
        </p>
      )}
    </div>
  )
}
