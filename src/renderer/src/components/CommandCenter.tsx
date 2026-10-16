import { useEffect, useRef, useState, type JSX } from 'react'
import NodeIcon from './NodeIcon'
import { ArrowUpRightIcon, ChatIcon } from './icons'
import { STATE_LABELS, URGENCY, agentKey, agentName, ago, byUrgency } from '../agentStatus'
import { AGENTS } from '../../../shared/agents'
import type { AgentReply, AgentState, AgentStatus } from '../../../shared/types'

// Every agent at a glance, grouped by workspace and the most urgent on top, with the answers that
// don't need a trip to its terminal: yes or no to what it asked, or a line of text. The pet opens
// it, and the HUD is made of it. onJump(status) takes the user to an agent.
export default function CommandCenter({
  statuses,
  onJump
}: {
  statuses: AgentStatus[]
  onJump: (status: AgentStatus) => void
}): JSX.Element {
  // Re-rendered every half minute, so the times stay right.
  const [, setNow] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const groups = Object.values(
    statuses.reduce<Record<string, { name?: string; members: AgentStatus[] }>>((all, status) => {
      const group = (all[status.workspaceId] ??= { name: status.workspace, members: [] })
      group.members.push(status)
      return all
    }, {})
  )
  for (const group of groups) group.members.sort(byUrgency)
  groups.sort(
    (a, b) =>
      URGENCY[b.members[0].state] - URGENCY[a.members[0].state] ||
      String(a.name).localeCompare(String(b.name))
  )

  const counts = statuses.reduce<Partial<Record<AgentState, number>>>(
    (all, s) => ({ ...all, [s.state]: (all[s.state] ?? 0) + 1 }),
    {}
  )
  const summary = (['waiting', 'failed', 'review', 'working'] as const)
    .filter((state) => counts[state])
    .map((state) => ({ state, text: `${counts[state]} ${STATE_LABELS[state].toLowerCase()}` }))

  return (
    <div className="command-center">
      <div className="command-summary">
        {summary.length ? (
          summary.map(({ state, text }) => (
            <span key={state} className="command-chip" data-state={state}>
              {text}
            </span>
          ))
        ) : (
          <span className="command-chip">{statuses.length ? 'All quiet' : 'No agents yet'}</span>
        )}
      </div>

      {groups.length === 0 && (
        <p className="command-empty">Agents you open from the dock show up here.</p>
      )}

      {groups.map(({ name, members }) => (
        <section key={members[0].workspaceId} className="command-group">
          <h3>{name ?? 'Workspace'}</h3>
          <ul>
            {members.map((status) => (
              <AgentRow key={agentKey(status)} status={status} onJump={onJump} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// An agent: its state, and what can be done from here. An agent waiting on the user gets yes and
// no right away; any of them can be sent a line of text.
function AgentRow({
  status,
  onJump
}: {
  status: AgentStatus
  onJump: (status: AgentStatus) => void
}): JSX.Element {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  // A word of confirmation after an answer goes out.
  const [sent, setSent] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (replying) input.current?.focus()
  }, [replying])

  async function reply(answer: AgentReply): Promise<void> {
    const ok = await window.api.agents.reply(status.workspaceId, status.nodeId, answer)
    setSent(ok ? 'Sent' : 'Couldn’t send')
    setTimeout(() => setSent(null), 1800)
    if (ok && answer.kind === 'text') {
      setText('')
      setReplying(false)
    }
  }

  return (
    <li className="command-row" data-state={status.state}>
      <div className="command-row-main">
        <span className="command-icon">
          <NodeIcon type="terminal" agent={status.agent} size={14} />
        </span>
        <button className="command-name" title="Go to this agent" onClick={() => onJump(status)}>
          {agentName(status)}
        </button>
        <span className="command-state">
          {sent ?? (
            <>
              {STATE_LABELS[status.state]}
              <span className="command-ago">{ago(status.since)}</span>
            </>
          )}
        </span>
        <div className="command-actions">
          {/* Only for agents whose keys for yes and no Nara knows (shared/agents.ts). */}
          {status.state === 'waiting' && AGENTS[status.agent]?.answers && (
            <>
              <button className="command-answer yes" onClick={() => reply({ kind: 'yes' })}>
                Yes
              </button>
              <button className="command-answer" onClick={() => reply({ kind: 'no' })}>
                No
              </button>
            </>
          )}
          <button
            className="icon-button small"
            title="Reply"
            aria-label={`Reply to ${agentName(status)}`}
            aria-expanded={replying}
            onClick={() => setReplying((open) => !open)}
          >
            <ChatIcon size={14} />
          </button>
          <button
            className="icon-button small"
            title="Go to this agent"
            aria-label={`Go to ${agentName(status)}`}
            onClick={() => onJump(status)}
          >
            <ArrowUpRightIcon size={14} />
          </button>
        </div>
      </div>
      {replying && (
        <form
          className="command-reply"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) reply({ kind: 'text', text })
          }}
        >
          <input
            ref={input}
            className="text-input"
            aria-label="Reply to the agent"
            value={text}
            placeholder={`Message ${agentName(status)}…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              e.stopPropagation()
              setReplying(false)
            }}
          />
          <button className="button primary small" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
    </li>
  )
}
