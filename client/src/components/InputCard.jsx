import { Link2, Upload, Sparkles } from 'lucide-react'
import SearchForm from './SearchForm'
import UploadDropzone from './UploadDropzone'

const TABS = [
  { id: 'link', label: 'YouTube link', short: 'Link', icon: Link2 },
  { id: 'upload', label: 'Upload a file', short: 'Upload', icon: Upload },
]

// Well-known videos to try the app with
const EXAMPLES = [
  { label: 'Gangnam Style', url: 'https://www.youtube.com/watch?v=9bZkp7q19f0' },
  { label: 'A mashup Short', url: 'https://www.youtube.com/watch?v=0kO82w9eLwI' },
  { label: 'Shape of You', url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8' },
]

/** The main input: switch between pasting a YouTube link and uploading a file. */
export default function InputCard({ mode, onModeChange, link, upload, loading, showExamples }) {
  return (
    <section className="card p-3 sm:p-4">
      <div role="tablist" aria-label="Input type" className="mb-3 inline-flex rounded-xl bg-latte-100 p-1">
        {TABS.map(({ id, label, short, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            disabled={loading}
            onClick={() => onModeChange(id)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
              mode === id ? 'bg-white text-latte-900 shadow-sm' : 'text-latte-600 hover:text-latte-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {/* Shorter labels on very small phones so the tabs stay on one line */}
            <span className="min-[380px]:hidden">{short}</span>
            <span className="hidden min-[380px]:inline">{label}</span>
          </button>
        ))}
      </div>

      {mode === 'link' ? (
        <>
          <SearchForm url={link.url} onUrlChange={link.onUrlChange} onSubmit={link.onSubmit} loading={loading} />
          {showExamples && (
            <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-xs text-latte-600">
              <Sparkles className="h-3.5 w-3.5 text-honey-500" /> Try:
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => link.onExample(ex.url)}
                  className="rounded-full border border-latte-300 bg-white px-3 py-1 font-medium text-latte-800 transition hover:border-latte-500 hover:bg-latte-50"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <UploadDropzone
          file={upload.file}
          onFile={upload.onFile}
          onSubmit={upload.onSubmit}
          loading={loading}
          uploadProgress={upload.progress}
        />
      )}
    </section>
  )
}
