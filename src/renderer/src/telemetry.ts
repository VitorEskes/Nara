// What the renderer makes of main's telemetry (main/telemetry.js): what each agent has spent, how
// full its context is, what it's working on and what it did.

import type { AgentReport, Usage } from '../../shared/types'

// "812", "14.2k", "1.3M".
export function formatTokens(n = 0): string {
  if (n < 1000) return String(n)
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`
  return `${(n / 1e6).toFixed(1)}M`
}

// "$0.42", "$12.30"; under a cent reads "<$0.01".
export function formatCost(usd = 0): string {
  if (!usd) return '$0'
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

// How full the context is, 0 to 1.
export function contextShare(usage: Usage | null | undefined): number {
  if (!usage?.context || !usage?.window) return 0
  return Math.min(1, usage.context / usage.window)
}

// The sum over several agents' usage: tokens and cost.
export function totalUsage(list: (Usage | null | undefined)[]): { tokens: number; cost: number } {
  return list.reduce<{ tokens: number; cost: number }>(
    (sum, usage) => ({
      tokens: sum.tokens + (usage?.tokens ?? 0),
      cost: sum.cost + (usage?.cost ?? 0)
    }),
    { tokens: 0, cost: 0 }
  )
}

// "claude-opus-5-5" reads "Opus 5.5"; anything else as it is.
export function modelName(model: string): string {
  const match = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/)
  if (!match) return model
  const [, family, major, minor] = match
  return `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

// What the agent is on: the task it's working through, else its conversation's title.
export function agentDoing(info: AgentReport | null | undefined): string | null {
  const active = info?.tasks?.find((t) => t.status === 'in_progress')
  return active ? active.active || active.text : (info?.title ?? null)
}
