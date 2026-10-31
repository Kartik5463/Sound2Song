import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Music2, Tag, Clock, Disc3, ExternalLink, MonitorPlay, CheckCircle2, Calendar } from 'lucide-react'
import ConfidenceRing from './ConfidenceRing'
import { MashupPanel, AlsoMatches, GetSong } from './SongExtras'
import { formatTime } from '../utils/format'

function InfoItem({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-latte-50 px-3 py-2.5 ring-1 ring-latte-200">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-latte-500" />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-latte-500">{label}</div>
        <div className="truncate text-sm font-semibold text-latte-900" title={value}>
          {value}
        </div>
      </div>
    </div>
  )
}

function LinkButton({ href, icon: Icon, children }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn-ghost">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </a>
  )
}

/** One identified song: cover, details, confidence, where it plays, preview and links. */
export default function SongCard({ song, color, videoUrl, videoDuration }) {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  // The mashup already has its own panel, so leave it out of "Also matches"
  const otherMatches = (song.alsoMatches ?? []).filter((t) => t.key !== song.mashup?.key)

  useEffect(() => () => audio.current?.pause(), [])

  function togglePreview() {
    if (!audio.current) return
    if (playing) audio.current.pause()
    else audio.current.play().catch(() => setPlaying(false))
  }

  const lowConfidence = song.confidence < 0.6
  // Uploads have no video URL, so no "Watch at" link
  const watchAt = videoUrl ? `${videoUrl}&t=${Math.floor(song.startTime)}s` : null

  return (
    <article className="card relative isolate overflow-hidden">
      {/* Header band tinted with the song's colour, with the cover art blurred behind it */}
      <div className="relative overflow-hidden px-5 pb-5 pt-5" style={{ background: `linear-gradient(135deg, ${color}26, transparent 70%)` }}>
        {song.coverUrl && (
          <img
            src={song.coverUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full object-cover opacity-30 blur-3xl"
          />
        )}
        <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap sm:gap-5">
          <div className="relative order-1 h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-latte-200 shadow-xl shadow-latte-800/25 ring-4 ring-white sm:h-32 sm:w-32">
            {song.coverUrl ? (
              <img src={song.coverUrl} alt={`${song.album || song.title} cover`} className="h-full w-full object-cover" />
            ) : (
              <Music2 className="absolute inset-0 m-auto h-10 w-10 text-latte-500" />
            )}
            {song.previewUrl && (
              <button
                type="button"
                onClick={togglePreview}
                aria-label={playing ? 'Pause preview' : 'Play 30 second preview'}
                title={playing ? 'Pause preview' : 'Play 30 second preview'}
                className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-latte-800 shadow-lg transition hover:scale-105"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
              </button>
            )}
          </div>

          <div className="order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                lowConfidence
                  ? 'bg-honey-500/10 text-honey-500 ring-honey-500/30'
                  : 'bg-olive-500/10 text-olive-600 ring-olive-500/30'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {lowConfidence ? 'Possible match' : 'Song found'}
            </span>
            <h3 className="mt-2 break-words font-display text-2xl font-bold leading-tight text-latte-950 sm:text-3xl">{song.title}</h3>
            <p className="text-lg font-medium" style={{ color }}>
              {song.artist}
            </p>
            {(song.album || song.year) && (
              <p className="mt-1 text-sm text-latte-600">
                {song.album && <>Album: {song.album}</>}
                {song.album && song.year && ' · '}
                {song.year}
              </p>
            )}
          </div>

          <div className="order-2 ml-auto sm:order-3">
            <ConfidenceRing value={song.confidence} />
          </div>
        </div>
      </div>

      <div className="border-t border-latte-200 px-5 pb-5 pt-4">
        {/* Where in the video the song plays */}
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-latte-800">
            Detected from {formatTime(song.startTime)} – {formatTime(song.endTime)}
            {song.appearances?.length > 1 && (
              <span className="font-normal text-latte-500"> (+{song.appearances.length - 1} more)</span>
            )}
          </span>
          <span className="text-xs text-latte-500">{formatTime(videoDuration)}</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-latte-100 ring-1 ring-latte-200">
          {song.appearances.map((a, i) => (
            <div
              key={i}
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${(a.start / videoDuration) * 100}%`,
                width: `${Math.max(((a.end - a.start) / videoDuration) * 100, 1.5)}%`,
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

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
          <InfoItem icon={Tag} label="Genre" value={song.genre} />
          <InfoItem icon={Clock} label="Duration" value={song.durationMs ? formatTime(song.durationMs / 1000) : null} />
          <InfoItem icon={Calendar} label="Released" value={song.year} />
          <InfoItem icon={Disc3} label="Label" value={song.label} />
        </div>

        <GetSong song={song} />
        {song.mashup && <MashupPanel mashup={song.mashup} />}
        {otherMatches.length > 0 && <AlsoMatches tracks={otherMatches} />}

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
          <span className="w-full self-center text-xs text-latte-500 sm:ml-auto sm:w-auto">
            {song.segmentsMatched} {song.segmentsMatched === 1 ? 'check' : 'checks'} matched
          </span>
        </div>
      </div>
    </article>
  )
}
