import { useEffect, useRef, useState, type JSX } from 'react'
import NodeIcon from './NodeIcon'
import ContextRing from './ContextRing'
import { contextShare, formatCost, formatTokens } from '../telemetry'
import { AGENTS } from '../../../shared/agents'
import type { Limits, NodeId, Usage, UsageWindow } from '../../../shared/types'

// What a workspace's agents have spent.
export interface Spend {
  tokens: number
  cost: number
  agents: { id: NodeId; name: string; agent?: string; usage?: Usage }[]
}

// How much of their plans the agents have used, in the top bar: for each provider, a bar with the
// share of the 5-hour window and the share of the week. A click opens the details under it: when
// each window resets, and what this workspace's agents have spent. `limits` comes from main's
// usage.js; `spend` is this workspace's { tokens, cost, agents: [{ id, name, agent, usage }] }.
export default function UsageMeter({
  limits,
  spend,
  onLocate
}: {
  limits: Limits | null
  spend: Spend
  onLocate: (id: NodeId) => void
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const providers = (Object.keys(AGENTS) as (keyof Limits)[]).filter(
    (key) => limits?.[key]?.fiveHour || limits?.[key]?.sevenDay
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!providers.length && !spend.tokens) return null

  return (
    <div className="usage" ref={root}>
      <button
        className="usage-meter"
        aria-expanded={open}
        title="Plan usage and what the agents spent"
        onClick={() => setOpen((o) => !o)}
      >
        {providers.length ? (
          providers.map((key) => {
            const { fiveHour, sevenDay } = limits![key]!
            const lead = (fiveHour ?? sevenDay)!
            return (
              <span key={key} className="usage-provider">
                <NodeIcon type="terminal" agent={key} size={13} />
                <span className="usage-bar" data-level={level(lead.used)}>
                  <span style={{ width: `${Math.min(100, lead.used)}%` }} />
                </span>
                <span className="usage-text">
                  {fiveHour && `${Math.round(fiveHour.used)}% 5h`}
                  {fiveHour && sevenDay && ' · '}
                  {sevenDay && `${Math.round(sevenDay.used)}% wk`}
                </span>
              </span>
            )
          })
        ) : (
          <span className="usage-text">{formatTokens(spend.tokens)} tokens</span>
        )}
      </button>

      {open && (
        <div className="floating usage-panel" role="dialog" aria-label="Usage">
          {providers.map((key) => {
            const report = limits![key]!
            return (
              <section key={key} className="usage-section">
                <header>
                  <NodeIcon type="terminal" agent={key} size={14} />
                  <h3>{AGENTS[key].label}</h3>
                  <span>updated {since(report.updated)}</span>
                </header>
                {report.fiveHour && <Window label="5-hour window" window={report.fiveHour} />}
                {report.sevenDay && <Window label="This week" window={report.sevenDay} />}
              </section>
            )
          })}
          {!providers.length && (
            <p className="usage-empty">
              Plan limits show up here once an agent answers: Claude Code on a Pro or Max plan, or
              Codex.
            </p>
          )}

          <section className="usage-section">
            <header>
              <h3>This workspace</h3>
              <span>at API prices</span>
            </header>
            <div className="usage-totals">
              <div>
                <strong>{formatTokens(spend.tokens)}</strong>
                <span>tokens</span>
              </div>
              <div>
                <strong>{formatCost(spend.cost)}</strong>
                <span>estimated</span>
              </div>
            </div>
            {spend.agents.length > 0 && (
              <ul className="usage-agents">
                {spend.agents.map((agent) => (
                  <li key={agent.id}>
                    <button
                      onClick={() => {
                        setOpen(false)
                        onLocate(agent.id)
                      }}
                    >
                      <NodeIcon type="terminal" agent={agent.agent} size={13} />
                      <span className="usage-agent-name">{agent.name}</span>
                      <span className="usage-agent-tokens">
                        {formatTokens(agent.usage?.tokens ?? 0)}
                      </span>
                      <span className="usage-agent-cost">{formatCost(agent.usage?.cost ?? 0)}</span>
                      {(agent.usage?.window ?? 0) > 0 ? (
                        <ContextRing share={contextShare(agent.usage)} size={14} />
                      ) : (
                        <span className="usage-ring-room" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Window({ label, window }: { label: string; window: UsageWindow }): JSX.Element {
  return (
    <div className="usage-window">
      <div className="usage-window-head">
        <span>{label}</span>
        <strong>{Math.round(window.used)}%</strong>
      </div>
      <div className="usage-bar wide" data-level={level(window.used)}>
        <span style={{ width: `${Math.min(100, window.used)}%` }} />
      </div>
      {window.resetsAt > 0 && <span className="usage-reset">Resets {until(window.resetsAt)}</span>}
    </div>
  )
}

function level(used: number): string {
  return used >= 85 ? 'full' : used >= 60 ? 'high' : 'ok'
}

// "in 2h 14m", or a day and time once it's more than a day off.
function until(time: number): string {
  const minutes = Math.max(0, Math.round((time - Date.now()) / 60000))
  if (minutes < 60) return `in ${minutes}m`
  if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return new Date(time).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function since(time: number | undefined): string {
  const minutes = Math.round((Date.now() - (time ?? 0)) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
