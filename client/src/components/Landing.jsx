import {
  Link2,
  AudioLines,
  Sparkles,
  Music,
  Blend,
  ListMusic,
  UploadCloud,
  History,
  Share2,
  Play,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react'
import ConfidenceRing from './ConfidenceRing'

/* ---------- Hero illustration: what a result looks like ---------- */

function EqualizerBars({ className = '' }) {
  const delays = [0, 0.2, 0.4, 0.1, 0.3, 0.5, 0.15]
  return (
    <div className={`flex h-8 items-end gap-1 ${className}`} aria-hidden>
      {delays.map((d, i) => (
        <span key={i} className="eq-bar w-1.5 rounded-full bg-latte-600" style={{ height: '100%', animationDelay: `${d}s` }} />
      ))}
    </div>
  )
}

export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mt-4">
      {/* Floating chips around the card */}
      <div className="absolute -left-5 -top-4 z-10 hidden rotate-[-5deg] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#8e4f7a] shadow-lg ring-1 ring-latte-200 sm:inline-flex">
        <Blend className="h-3.5 w-3.5" /> Mashup detected
      </div>
      <div className="absolute -bottom-4 right-8 z-10 hidden rotate-[4deg] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-olive-600 shadow-lg ring-1 ring-latte-200 sm:inline-flex">
        <ListMusic className="h-3.5 w-3.5" /> 3 songs found
      </div>

      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-honey-500/20 blur-3xl" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-latte-500">Example result</span>
          <EqualizerBars className="h-5" />
        </div>
        <div className="mt-4 flex items-center gap-3 sm:gap-4">
          <div className="relative grid h-20 w-20 sm:h-24 sm:w-24 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-latte-500 via-latte-700 to-latte-900 text-white shadow-xl ring-4 ring-white">
            <Music className="h-10 w-10 opacity-90" />
            <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white text-latte-800 shadow">
              <Play className="h-3.5 w-3.5 translate-x-px fill-current" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-olive-500/10 px-2 py-0.5 text-[11px] font-semibold text-olive-600 ring-1 ring-olive-500/30">
              <CheckCircle2 className="h-3 w-3" /> Song found
            </span>
            <div className="mt-1.5 font-display text-xl font-bold leading-tight text-latte-950 sm:text-2xl">Gangnam Style</div>
            <div className="text-sm font-medium text-latte-600 sm:text-base">PSY · The Singles · 2012</div>
          </div>
          <div className="hidden min-[400px]:block">
            <ConfidenceRing value={0.99} size={64} />
          </div>
        </div>
        <div className="mt-5 text-xs font-medium text-latte-700">Detected from 0:58 – 3:12</div>
        <div className="relative mt-1.5 h-2.5 rounded-full bg-latte-100 ring-1 ring-latte-200">
          <div className="absolute inset-y-0 left-[23%] w-[53%] rounded-full bg-latte-600" />
        </div>
        <div className="mt-4 flex gap-1.5">
          {['#b0703c', '#b0703c', '#3f8f8a', '#3f8f8a', '#3f8f8a', '#8e4f7a', '#8e4f7a'].map((c, i) => (
            <div key={i} className="h-6 flex-1 rounded-md" style={{ background: c, opacity: i % 3 === 1 ? 0.5 : 1 }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-latte-500">
          <span>0:00</span>
          <span>Timeline of songs in the video</span>
          <span>4:12</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Stats strip ---------- */

export function StatsStrip() {
  const stats = [
    { value: '5–15 s', label: 'Typical time per video' },
    { value: '200 MB', label: 'Largest file you can upload' },
    { value: '15 min', label: 'Longest video or file' },
    { value: '100%', label: 'Free, no sign-up' },
  ]
  return (
    <section className="card-tint grid grid-cols-2 gap-px overflow-hidden lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-white/60 px-3 py-5 text-center sm:px-5">
          <div className="font-display text-2xl font-bold text-latte-800 sm:text-3xl">{s.value}</div>
          <div className="mt-1 text-xs text-latte-600 sm:text-sm">{s.label}</div>
        </div>
      ))}
    </section>
  )
}

/* ---------- How it works ---------- */

export function HowItWorks() {
  const steps = [
    { icon: Link2, title: 'Paste or upload', text: 'A YouTube video, Short or Music link, or an audio/video file from your computer.' },
    { icon: AudioLines, title: 'Clean the audio', text: 'We extract the audio, remove silence and find the moments where the music changes.' },
    { icon: Sparkles, title: 'Match the songs', text: 'A few clips are fingerprinted and matched against Shazam’s catalogue.' },
    { icon: ListMusic, title: 'Get the details', text: 'Title, artist, album, where each song plays, mashups and a 30-second preview.' },
  ]
  return (
    <section id="how" className="scroll-mt-24">
      <SectionTitle eyebrow="How it works" title="From a link to a song name in seconds" />
      <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="card relative overflow-hidden p-5">
            <span className="pointer-events-none absolute right-4 top-2 font-display text-6xl font-bold leading-none text-latte-200/70">
              {i + 1}
            </span>
            <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-latte-500 to-latte-700 text-white shadow-md">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="relative mt-3 font-semibold text-latte-950">{title}</h3>
            <p className="relative mt-1 text-sm text-latte-600">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ---------- Features ---------- */

export function Features() {
  const features = [
    { icon: Link2, title: 'Any YouTube link', text: 'Videos, Shorts and YouTube Music, just paste the link.' },
    { icon: UploadCloud, title: 'Upload your own files', text: 'MP3, WAV, M4A, MP4, MOV… Files are deleted right after.' },
    { icon: ListMusic, title: 'Multiple songs', text: 'Finds every song in montages and compilations, with time ranges.' },
    { icon: Blend, title: 'Mashup detection', text: 'Spots mashups and tells you which songs they combine.' },
    { icon: History, title: 'Search history', text: 'Your recent searches, saved in this browser. No account needed.' },
    { icon: Share2, title: 'Shareable results', text: 'Every result has its own link you can copy and send.' },
  ]
  return (
    <section id="features" className="scroll-mt-24">
      <SectionTitle eyebrow="Features" title="Everything you need to name that tune" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-5 transition hover:-translate-y-0.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-latte-100 text-latte-700 ring-1 ring-latte-200">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-3 font-semibold text-latte-950">{title}</h3>
            <p className="mt-1 text-sm text-latte-600">{text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionTitle({ eyebrow, title }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-latte-500">{eyebrow}</div>
      <h2 className="mt-1 font-display text-2xl font-bold text-latte-950 sm:text-3xl">{title}</h2>
    </div>
  )
}

/* ---------- Sidebar: tips ---------- */

export function TipsCard() {
  const tips = [
    'Shorts and clips with clear music give the best results.',
    'For mashups, the loudest song is named and the mashup is shown below it.',
    'Phone recordings work when the music is loud and close to the mic.',
    'Searching the same video again is instant: results are saved for 7 days.',
  ]
  return (
    <aside className="card-tint p-4">
      <h2 className="flex items-center gap-2 font-semibold text-latte-950">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-honey-500/15 text-honey-500">
          <Lightbulb className="h-4 w-4" />
        </span>
        Tips for better results
      </h2>
      <ul className="mt-3 space-y-2.5">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2 text-sm text-latte-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-olive-500" />
            {tip}
          </li>
        ))}
      </ul>
    </aside>
  )
}
