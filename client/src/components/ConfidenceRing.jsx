/** Circular gauge showing a 0–1 confidence value as a percentage. */
export default function ConfidenceRing({ value, size = 76 }) {
  const pct = Math.round(value * 100)
  const stroke = 7
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const color = value >= 0.85 ? '#5a7a3c' : value >= 0.6 ? '#d39a3a' : '#c0583f'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="#fdf9f4" stroke="#efe1cf" strokeWidth={stroke} />
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
        <span className="absolute inset-0 grid place-items-center text-lg font-bold text-latte-900">{pct}%</span>
      </div>
      <span className="text-xs font-medium text-latte-600">Confidence</span>
    </div>
  )
}
