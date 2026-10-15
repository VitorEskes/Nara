import type { JSX } from 'react'

// Shika, the Nara deer from the app's icon, as the built-in pet. Drawn here instead of a sprite
// sheet so it stays sharp at any size; main.css moves its parts for each `mood` (idle, working,
// waiting, review, failed, jump) and while it's `dragging`.
export default function Shika({
  mood = 'idle',
  dragging
}: {
  mood?: string
  dragging?: boolean
}): JSX.Element {
  return (
    <svg
      className="shika"
      data-mood={mood}
      data-dragging={dragging || undefined}
      viewBox="0 0 96 104"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="shika-fur" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#3f8462" />
          <stop offset="1" stopColor="#24503d" />
        </radialGradient>
      </defs>
      <ellipse className="shika-shadow" cx="50" cy="100" rx="24" ry="3" />
      <g className="shika-body">
        <circle cx="70" cy="85" r="5" fill="#24503d" />
        <ellipse cx="50" cy="80" rx="21" ry="19" fill="url(#shika-fur)" />
        <circle cx="58" cy="73" r="2.2" fill="#6aa585" opacity="0.55" />
        <circle cx="63.5" cy="79" r="1.8" fill="#6aa585" opacity="0.55" />
        <circle cx="56" cy="82" r="1.5" fill="#6aa585" opacity="0.55" />
        <rect x="38" y="86" width="8" height="14" rx="4" fill="#24503d" />
        <rect x="52" y="86" width="8" height="14" rx="4" fill="#24503d" />
      </g>
      <g className="shika-head">
        <g
          className="shika-antlers"
          fill="none"
          stroke="#2b2d2b"
          strokeWidth="5"
          strokeLinecap="round"
        >
          <path d="M39 31C37 23 31 18 27 11M33 22C29 22 25 24 21 22M30 16C30 12 32 9 34 6" />
          <path d="M57 31C59 23 65 18 69 11M63 22C67 22 71 24 75 22M66 16C66 12 64 9 62 6" />
        </g>
        <ellipse cx="27" cy="40" rx="9" ry="4.5" fill="#2d6249" transform="rotate(-25 27 40)" />
        <ellipse cx="69" cy="40" rx="9" ry="4.5" fill="#2d6249" transform="rotate(25 69 40)" />
        <ellipse cx="48" cy="46" rx="20" ry="17" fill="url(#shika-fur)" />
        <ellipse cx="48" cy="53.5" rx="7" ry="4.5" fill="#3d7a5c" />
        <circle cx="36" cy="51" r="2.6" fill="#e2756a" opacity="0.3" />
        <circle cx="60" cy="51" r="2.6" fill="#e2756a" opacity="0.3" />
        <g className="shika-eyes" fill="#1d201e">
          <circle cx="41" cy="45" r="2.6" />
          <circle cx="55" cy="45" r="2.6" />
        </g>
        <path
          d="M45.5 52.5q2.5 2 5 0"
          fill="none"
          stroke="#1d201e"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* A drop of sweat, only shown when an agent failed. */}
        <path className="shika-drop" d="M68 30c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z" />
      </g>
    </svg>
  )
}
