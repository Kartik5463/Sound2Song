import { Blend, Check, Search, ExternalLink, Music2 } from 'lucide-react'

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
    <section className="mt-5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-fuchsia-200">
        <Blend className="h-4 w-4" /> Mashup detected
      </div>
      <p className="mt-1 text-sm text-slate-300">
        This audio also matches{' '}
        {mashup.shazamUrl ? (
          <a href={mashup.shazamUrl} target="_blank" rel="noreferrer" className="font-medium text-white hover:underline">
            {mashup.title}
          </a>
        ) : (
          <span className="font-medium text-white">{mashup.title}</span>
        )}
        {mashup.artist && <span className="text-slate-400"> by {mashup.artist}</span>}, which combines:
      </p>
      <ul className="mt-3 space-y-2">
        {mashup.parts.map((part) => (
          <li key={part.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {part.identified ? (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Check className="h-4 w-4 text-emerald-400" /> {part.name}
                </span>
                <span className="text-xs text-slate-500">heard in the audio</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Music2 className="h-4 w-4 text-fuchsia-300" /> {part.name}
                </span>
                <span className="text-xs text-slate-500">from the mashup's name ·</span>
                {searchLinks(part.name).map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"
                  >
                    <Search className="h-3 w-3" /> {l.label}
                  </a>
                ))}
              </>
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
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Also matches</h4>
      <ul className="space-y-1.5">
        {tracks.map((t) => (
          <li key={t.key} className="flex items-center gap-3 text-sm">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-800">
              {t.coverUrl && <img src={t.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 truncate">
              {t.title} <span className="text-slate-400">– {t.artist}</span>
            </div>
            {t.shazamUrl && (
              <a
                href={t.shazamUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${t.title} on Shazam`}
                className="text-slate-500 hover:text-slate-200"
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
