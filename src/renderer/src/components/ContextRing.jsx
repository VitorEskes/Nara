// How full an agent's context is, as a ring that fills up and warms as it does.
export default function ContextRing({ share, size = 18 }) {
  const r = (size - 3) / 2
  const length = 2 * Math.PI * r
  const level = share > 0.85 ? 'full' : share > 0.6 ? 'high' : 'ok'
  return (
    <svg
      className="context-ring"
      data-level={level}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Context ${Math.round(share * 100)}% full`}
    >
      <title>{`Context ${Math.round(share * 100)}% full`}</title>
      <circle className="context-ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="context-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={`${length * share} ${length}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
