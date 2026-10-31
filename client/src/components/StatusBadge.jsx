const styles = {
  ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  down: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  loading: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

export default function StatusBadge({ label, status }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 ${styles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}: {status}
    </span>
  )
}
