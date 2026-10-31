const styles = {
  ok: 'bg-olive-500/10 text-olive-600 ring-olive-500/25',
  down: 'bg-terracotta-500/10 text-terracotta-600 ring-terracotta-500/25',
  loading: 'bg-latte-200/60 text-latte-600 ring-latte-300',
}

/** Small pill showing whether one service is reachable. */
export default function StatusBadge({ label, status }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'loading' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}
