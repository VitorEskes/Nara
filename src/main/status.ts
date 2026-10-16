import { BrowserWindow, ipcMain } from 'electron'
import type { AgentState, AgentStatus, NodeId } from '../shared/types'

// What each agent is up to, read from its terminal, for the pet: working while its output keeps
// coming, then waiting on the user (it rang the bell, which is how an agent asks for attention)
// or done and ready for review once it goes quiet; failed if it exited with an error. Typing in
// the terminal, or the pet taking the user there, sets it back to idle.
//
// Output right after the user typed is the echo, and output right after a resize is a redraw:
// neither counts as the agent working.
const ECHO = 400
// Output has to keep coming for this long to count as work, so a one-off redraw doesn't.
const SUSTAINED = 800
// Quiet for this long after working means the agent's turn is over.
const QUIET = 3000
// What an agent draws as it starts (its welcome screen, a resumed conversation) isn't work.
const STARTUP = 4000
const TICK = 500

// pty id -> { workspaceId, nodeId, agent, state, since, burst, last, touched, bell }: `burst` is
// when the current run of output began, `last` the latest output and `touched` the latest input.
interface TrackedAgent {
  workspaceId: string
  nodeId: NodeId
  agent: string
  state: AgentState
  since: number
  burst?: number
  last: number
  touched: number
  bell?: boolean
}

type Describe = (workspaceId: string, nodeId: NodeId) => Pick<AgentStatus, 'title' | 'workspace'>
type Listener = (statuses: AgentStatus[]) => void

const agents = new Map<number, TrackedAgent>()
let send = (): void => {}
let describe: Describe = () => ({})
// Who else hears every change besides the windows: the desktop pet's process (pet.ts).
const listeners = new Set<Listener>()

// `name(workspaceId, nodeId)` gives the node's title and its workspace's name for the pet's
// bubble.
export function registerStatus(win: BrowserWindow, name: Describe): void {
  describe = name
  // Every window hears it: the main one, and the floating HUD when it's open.
  send = () => {
    const statuses = list()
    for (const other of BrowserWindow.getAllWindows())
      other.webContents.send('agents:status', statuses)
    for (const fn of listeners) fn(statuses)
  }
  ipcMain.handle('agents:status', () => list())
  ipcMain.on('agents:seen', (_ev, workspaceId: string, nodeId: NodeId) =>
    seenAgent(workspaceId, nodeId)
  )
  const timer = setInterval(tick, TICK)
  win.on('closed', () => {
    clearInterval(timer)
    agents.clear()
    send = () => {}
    ipcMain.removeHandler('agents:status')
    ipcMain.removeAllListeners('agents:seen')
  })
}

// Calls fn with every agent's status now and whenever they change; returns what stops it.
export function onStatuses(fn: Listener): () => void {
  listeners.add(fn)
  fn(list())
  return () => {
    listeners.delete(fn)
  }
}

// The user looked at the agent: what it finished or asked for has been seen.
export function seenAgent(workspaceId: string, nodeId: NodeId): void {
  for (const agent of agents.values()) {
    if (agent.workspaceId === workspaceId && agent.nodeId === nodeId) settle(agent)
  }
}

// A node has one agent at a time: one that restarts (a new role) replaces the one before.
export function trackAgent(
  id: number,
  { workspaceId, nodeId, agent }: Pick<TrackedAgent, 'workspaceId' | 'nodeId' | 'agent'>
): void {
  for (const [other, entry] of agents) {
    if (entry.workspaceId === workspaceId && entry.nodeId === nodeId) agents.delete(other)
  }
  const now = Date.now()
  agents.set(id, {
    workspaceId,
    nodeId,
    agent,
    state: 'idle',
    since: now,
    last: 0,
    touched: now + STARTUP - ECHO
  })
  send()
}

export function agentOutput(id: number, data: string): void {
  const agent = agents.get(id)
  if (!agent) return
  const now = Date.now()
  if (now - (agent.touched ?? 0) < ECHO) return
  if (hasBell(data)) agent.bell = true
  if (!agent.burst || now - agent.last > QUIET) agent.burst = now
  agent.last = now
  if (agent.state !== 'working' && now - agent.burst >= SUSTAINED) {
    agent.bell = false
    change(agent, 'working')
  } else if (agent.state === 'working' && agent.bell) {
    change(agent, 'waiting')
  }
}

// The user typed, or the terminal was resized: what comes back is theirs, and whatever the agent
// was waiting for has been seen.
export function agentTouched(id: number, typed: boolean): void {
  const agent = agents.get(id)
  if (!agent) return
  agent.touched = Date.now()
  if (typed) settle(agent)
}

export function agentExited(id: number, code: number): void {
  const agent = agents.get(id)
  if (!agent) return
  if (code === 0) {
    agents.delete(id)
    send()
  } else change(agent, 'failed')
}

// What Claude Code's hooks report (`nara hook`): it took a prompt, ended its turn, or asked for
// something. Each settles the state right away instead of waiting for the output to tell.
export function agentHook(
  id: number,
  event: string,
  { message, type }: { message?: string; type?: string } = {}
): void {
  const agent = agents.get(id)
  if (!agent) return
  if (event === 'prompt') {
    agent.bell = false
    change(agent, 'working')
  } else if (event === 'stop') {
    agent.bell = false
    agent.burst = 0
    change(agent, 'review')
  } else if (event === 'notify') {
    // Claude Code also notifies when it has been idle a while; only a question needs the user.
    const asks = type
      ? type === 'permission_prompt'
      : /permission|approv|needs your/i.test(message ?? '')
    if (asks) change(agent, 'waiting')
  }
}

// Whether an agent is running in the node, opened with it or typed in it.
export function agentIn(workspaceId: string, nodeId: NodeId): string | null {
  for (const agent of agents.values()) {
    if (agent.workspaceId === workspaceId && agent.nodeId === nodeId) return agent.agent
  }
  return null
}

export function untrackAgent(id: number): void {
  if (agents.delete(id)) send()
}

function tick(): void {
  const now = Date.now()
  for (const agent of agents.values()) {
    if (agent.state === 'working' && now - agent.last >= QUIET) {
      change(agent, agent.bell ? 'waiting' : 'review')
      agent.burst = 0
    }
  }
}

function settle(agent: TrackedAgent): void {
  agent.bell = false
  if (agent.state === 'waiting' || agent.state === 'review' || agent.state === 'failed') {
    change(agent, 'idle')
  }
}

function change(agent: TrackedAgent, state: AgentState): void {
  if (agent.state === state) return
  agent.state = state
  agent.since = Date.now()
  send()
}

function list(): AgentStatus[] {
  return [...agents.values()].map(({ workspaceId, nodeId, agent, state, since }) => ({
    workspaceId,
    nodeId,
    agent,
    state,
    since,
    ...describe(workspaceId, nodeId)
  }))
}

// A bell on its own, not the one that ends an escape sequence (a window title, a link).
function hasBell(data: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x07/.test(data.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, ''))
}
