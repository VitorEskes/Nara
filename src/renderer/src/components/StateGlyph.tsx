import type { JSX } from 'react'
import { STATE_LABELS } from '../agentStatus'
import type { AgentState } from '../../../shared/types'

// An agent's state as a small mark: an arc spinning while it works, a check once it's done, a
// filled dot when it needs the user, a cross when it stopped, a ring when it's idle and a dashed
// one when it isn't running.
export default function StateGlyph({
  state = 'off',
  size = 12
}: {
  state?: AgentState | 'off'
  size?: number
}): JSX.Element {
  const label = state === 'off' ? 'Not running' : STATE_LABELS[state]
  return (
    <svg
      className="state-glyph"
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {state === 'working' && (
        <>
          <circle cx="6" cy="6" r="4.5" opacity="0.25" />
          <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" />
        </>
      )}
      {state === 'review' && (
        <>
          <circle cx="6" cy="6" r="4.5" />
          <path d="M4 6.2l1.4 1.4L8 4.9" />
        </>
      )}
      {state === 'waiting' && <circle cx="6" cy="6" r="3.6" fill="currentColor" stroke="none" />}
      {state === 'failed' && (
        <>
          <circle cx="6" cy="6" r="4.5" />
          <path d="M4.4 4.4l3.2 3.2M7.6 4.4L4.4 7.6" />
        </>
      )}
      {state === 'idle' && <circle cx="6" cy="6" r="3.2" />}
      {state === 'off' && <circle cx="6" cy="6" r="3.6" strokeDasharray="1.6 1.9" />}
    </svg>
  )
}
