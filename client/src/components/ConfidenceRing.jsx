/** Circular gauge showing a 0–1 confidence value as a percentage. */
export default function ConfidenceRing({ value, size = 72 }) {
  const pct = Math.round(value * 100)
  const stroke = 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const color = value >= 0.85 ? '#2dd4bf' : value >= 0.6 ? '#fbbf24' : '#f87171'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-semibold">{pct}%</span>
      </div>
      <span className="text-xs text-slate-400">Confidence</span>
    </div>
  )
}
