// What the renderer makes of main's telemetry (main/telemetry.js): what each agent has spent, how
// full its context is, what it's working on and what it did.

// "812", "14.2k", "1.3M".
export function formatTokens(n = 0) {
  if (n < 1000) return String(n)
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`
  return `${(n / 1e6).toFixed(1)}M`
}

// "$0.42", "$12.30"; under a cent reads "<$0.01".
export function formatCost(usd = 0) {
  if (!usd) return '$0'
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

// How full the context is, 0 to 1.
export function contextShare(usage) {
  if (!usage?.context || !usage?.window) return 0
  return Math.min(1, usage.context / usage.window)
}

// The sum over several agents' usage: tokens and cost.
export function totalUsage(list) {
  return list.reduce(
    (sum, usage) => ({
      tokens: sum.tokens + (usage?.tokens ?? 0),
      cost: sum.cost + (usage?.cost ?? 0)
    }),
    { tokens: 0, cost: 0 }
  )
}
