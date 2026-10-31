import { Blend, Check, Search, ExternalLink, Music2, PlayCircle, BadgeCheck, Download } from 'lucide-react'

const searchLinks = (name) => [
  { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}` },
  { label: 'Apple Music', href: `https://music.apple.com/search?term=${encodeURIComponent(name)}` },
]

/**
 * The song is part of a mashup. Shazam matched the mashup track itself, and its title tells
 * us which songs it combines. Parts we also heard in the audio get a check mark; the others
 * are known by name only, so we offer searches rather than guessing a specific recording.
 */
export function MashupPanel({ mashup }) {
  return (
    <section className="mt-4 rounded-2xl border border-[#8e4f7a]/25 bg-[#8e4f7a]/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#8e4f7a]">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#8e4f7a]/10">
          <Blend className="h-4 w-4" />
        </span>
        Mashup detected
      </div>
      <p className="mt-2 text-sm text-latte-700">
        This audio also matches{' '}
        {mashup.shazamUrl ? (
          <a href={mashup.shazamUrl} target="_blank" rel="noreferrer" className="font-semibold text-latte-950 hover:underline">
            {mashup.title}
          </a>
        ) : (
          <span className="font-semibold text-latte-950">{mashup.title}</span>
        )}
        {mashup.artist && <span> by {mashup.artist}</span>}, which combines:
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {mashup.parts.map((part) => (
          <li key={part.name} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-latte-200">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-latte-900">
              {part.identified ? (
                <Check className="h-4 w-4 text-olive-600" />
              ) : (
                <Music2 className="h-4 w-4 text-[#8e4f7a]" />
              )}
              {part.name}
            </div>
            {part.identified ? (
              <div className="mt-0.5 text-xs text-latte-500">Heard in the audio</div>
            ) : (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-latte-500">
                From the mashup's name ·
                {searchLinks(part.name).map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-latte-700 hover:underline"
                  >
                    <Search className="h-3 w-3" /> {l.label}
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Other catalogue tracks that matched the same audio: versions, covers, remixes. */
export function AlsoMatches({ tracks }) {
  return (
    <section className="mt-4">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-latte-500">Also matches</h4>
      <ul className="divide-y divide-latte-200 rounded-xl ring-1 ring-latte-200">
        {tracks.map((t) => (
          <li key={t.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-latte-200">
              {t.coverUrl && <img src={t.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 truncate font-medium text-latte-900">
              {t.title} <span className="font-normal text-latte-500">– {t.artist}</span>
            </div>
            {t.shazamUrl && (
              <a
                href={t.shazamUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${t.title} on Shazam`}
                className="text-latte-400 hover:text-latte-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Where to watch the song and, only when it is legally free, download it.
 * - officialVideo: from MusicBrainz or a strong match from the artist's/label's channel
 *   ("official"), otherwise the best YouTube search match. If there is none, link to a search.
 * - freeDownloads: only links MusicBrainz editors marked "download for free" (e.g. Bandcamp).
 */
export function GetSong({ song }) {
  const video = song.officialVideo
  const downloads = song.freeDownloads ?? []
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.artist ?? ''} ${song.title}`)}`

  return (
    <section className="mt-4 rounded-2xl bg-latte-50 p-3 ring-1 ring-latte-200">
      <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-latte-500">Watch &amp; listen</h4>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={video?.url ?? searchUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-latte-200 transition hover:ring-latte-400 sm:min-w-[15rem]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#c0392b] text-white shadow-sm">
            <PlayCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-1 text-sm font-semibold text-latte-950">
              {video ? (video.official ? 'Official video' : 'Best match') : 'Search'}
              <span className="hidden min-[420px]:inline">on YouTube</span>
              {video?.official && <BadgeCheck className="h-4 w-4 shrink-0 text-olive-600" aria-label="Official" />}
            </span>
            <span className="block truncate text-xs text-latte-500">
              {video?.channel
                ? `${video.channel}${video.official ? '' : ' · may not be the official upload'}`
                : video
                  ? 'Linked to this recording on MusicBrainz'
                  : `${song.artist} – ${song.title}`}
            </span>
          </span>
          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-latte-400 group-hover:text-latte-700" />
        </a>

        {downloads.map((d) => (
          <a
            key={d.url}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-olive-500/10 px-3 py-2.5 ring-1 ring-olive-500/30 transition hover:bg-olive-500/15 sm:min-w-[15rem]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-olive-600 text-white shadow-sm">
              <Download className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-latte-950">Free download on {d.site}</span>
              <span className="block truncate text-xs text-latte-600">Offered free by the artist · listed on MusicBrainz</span>
            </span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-latte-400 group-hover:text-latte-700" />
          </a>
        ))}
      </div>
    </section>
  )
}
