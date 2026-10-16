import { nodeLabel } from './nodeLabel'
import type { AgentState, AgentStatus } from '../../shared/types'

// What the pet, its command center and the HUD make of main's agent statuses
// (status.js): how urgent each state is, what to call it, and who the agent is.

// Waiting on the user first, then failed, done, at work, and idle last.
export const URGENCY: Record<AgentState, number> = {
  waiting: 4,
  failed: 3,
  review: 2,
  working: 1,
  idle: 0
}

export const STATE_LABELS: Record<AgentState, string> = {
  waiting: 'Needs you',
  failed: 'Stopped',
  review: 'Done',
  working: 'Working',
  idle: 'Idle'
}

// Most urgent first; among equals, the latest change first.
export function byUrgency(a: AgentStatus, b: AgentStatus): number {
  return URGENCY[b.state] - URGENCY[a.state] || b.since - a.since
}

export function agentName({ nodeId, title }: Pick<AgentStatus, 'nodeId' | 'title'>): string {
  return nodeLabel({ type: 'terminal', id: nodeId, title })
}

// The same agent across updates.
export function agentKey({
  workspaceId,
  nodeId
}: Pick<AgentStatus, 'workspaceId' | 'nodeId'>): string {
  return `${workspaceId}:${nodeId}`
}

// "now", "4m", "2h", "3d": how long the agent has been in its state.
export function ago(since: number, now = Date.now()): string {
  const minutes = Math.floor((now - since) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}
