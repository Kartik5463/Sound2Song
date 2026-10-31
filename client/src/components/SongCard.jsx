import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Music2, Tag, Clock, Disc3, ExternalLink, MonitorPlay } from 'lucide-react'
import ConfidenceRing from './ConfidenceRing'
import { formatTime } from '../utils/format'

function InfoItem({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="truncate text-sm" title={value}>
          {value}
        </div>
      </div>
    </div>
  )
}

function LinkButton({ href, icon: Icon, children }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </a>
  )
}

/** One identified song: cover, details, confidence, where it plays in the video, preview. */
export default function SongCard({ song, color, videoUrl, videoDuration }) {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => () => audio.current?.pause(), [])

  function togglePreview() {
    if (!audio.current) return
    if (playing) audio.current.pause()
    else audio.current.play().catch(() => setPlaying(false))
  }

  const lowConfidence = song.confidence < 0.6
  const watchAt = `${videoUrl}&t=${Math.floor(song.startTime)}s`

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-800">
          {song.coverUrl ? (
            <img src={song.coverUrl} alt={`${song.album || song.title} cover`} className="h-full w-full object-cover" />
          ) : (
            <Music2 className="absolute inset-0 m-auto h-10 w-10 text-slate-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ring-1 ${
              lowConfidence
                ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
            }`}
          >
            {lowConfidence ? 'Possible match' : 'Song found'}
          </span>
          <h3 className="mt-2 text-xl font-semibold leading-tight">{song.title}</h3>
          <p className="text-sky-300">{song.artist}</p>
          {(song.album || song.year) && (
            <p className="mt-1 text-sm text-slate-400">
              {song.album && <>Album: {song.album}</>}
              {song.album && song.year && ' · '}
              {song.year}
            </p>
          )}
        </div>

        <ConfidenceRing value={song.confidence} />
      </div>

      {/* Where in the video the song plays */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center gap-3 text-sm text-slate-300">
          {song.previewUrl && (
            <button
              type="button"
              onClick={togglePreview}
              aria-label={playing ? 'Pause preview' : 'Play 30 second preview'}
              title={playing ? 'Pause preview' : 'Play 30 second preview'}
              className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 transition hover:bg-slate-700"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
            </button>
          )}
          <span>
            Detected from {formatTime(song.startTime)} – {formatTime(song.endTime)}
            {song.appearances?.length > 1 && (
              <span className="text-slate-500"> (+{song.appearances.length - 1} more)</span>
            )}
          </span>
        </div>
        <div className="relative h-1.5 rounded-full bg-slate-800">
          {song.appearances.map((a, i) => (
            <div
              key={i}
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${(a.start / videoDuration) * 100}%`,
                width: `${Math.max(((a.end - a.start) / videoDuration) * 100, 1)}%`,
                background: color,
              }}
            />
          ))}
        </div>
        {song.previewUrl && (
          <audio
            ref={audio}
            src={song.previewUrl}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-4">
        <InfoItem icon={Tag} label="Genre" value={song.genre} />
        <InfoItem icon={Clock} label="Duration" value={song.durationMs ? formatTime(song.durationMs / 1000) : null} />
        <InfoItem icon={Disc3} label="Label" value={song.label} />
        <InfoItem icon={Music2} label="Checks matched" value={String(song.segmentsMatched)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={watchAt} icon={MonitorPlay}>
          Watch at {formatTime(song.startTime)}
        </LinkButton>
        <LinkButton href={song.appleMusicUrl} icon={ExternalLink}>
          Apple Music
        </LinkButton>
        <LinkButton href={song.shazamUrl} icon={ExternalLink}>
          Shazam
        </LinkButton>
      </div>
    </article>
  )
}
