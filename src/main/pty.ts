import { ipcMain, type BrowserWindow } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync, readlinkSync } from 'fs'
import { homedir } from 'os'
import * as pty from 'node-pty'
import { AGENTS } from '../shared/agents'
import { agentLaunch, startupLaunch, type Hooks, type Launch } from './agents'
import { commandEnded, commandOutput, commandStarted } from './changes'
import { defaultShell, isPowerShell, shellIntegration } from './shell'
import { agentExited, agentOutput, agentTouched, trackAgent, untrackAgent } from './status'
import { unwatchAgent, watchAgent } from './telemetry'
import type { PtyOptions } from '../preload'
import type { AgentReply, NodeId } from '../shared/types'

interface Terminal {
  workspaceId: string
  nodeId: NodeId
  term: pty.IPty
  agent?: string
}

// Each canvas terminal is a real PTY, identified by an id.
// The renderer never touches node-pty: everything goes through IPC.
// Also stores the workspace and canvas node that own the PTY: links are between nodes, not PTYs,
// and node ids are only unique within a workspace.
export const terminals = new Map<number, Terminal>()
let nextId = 1
// Claude Code's hooks that tell Nara, through the `nara` command, when the agent takes a prompt,
// ends its turn and asks for something (status.ts), more reliably than its output can.
export const HOOKS: Hooks = Object.fromEntries(
  [
    ['UserPromptSubmit', 'prompt'],
    ['Stop', 'stop'],
    ['Notification', 'notify']
  ].map(([event, name]) => [
    event,
    [{ hooks: [{ type: 'command', command: `nara hook ${name}` }] }]
  ])
)
// How long a killed terminal gets to exit on its own before it's killed outright.
const KILL_GRACE = 2000
// Exits still pending from kill().
const exiting = new Set<Promise<unknown>>()
// The context an agent gets as its first message (agents.ts), by pty id, until it's delivered:
// { text, started, last }. It goes once the agent's start-up output has gone quiet, or after
// CONTEXT_WAIT whatever it's doing.
const contexts = new Map<number, { text: string; started: number; last: number }>()
const CONTEXT_QUIET = 1500
const CONTEXT_WAIT = 20000
let send: (channel: string, ...args: unknown[]) => void = () => {}
// Agents about to restart (a new model, `nara model`), by workspace and node, with the messages
// sent to them in the meantime: the old terminal is on its way out, and the new one gets them.
const holding = new Map<string, string[]>()
const holdKey = (workspaceId: string, nodeId: NodeId): string => `${workspaceId}:${nodeId}`
const HOLD_LIMIT = 30000

// `extraEnv` holds the variables every terminal gets (the ones the `nara` command uses).
export function registerPty(win: BrowserWindow, extraEnv: Record<string, string>): void {
  send = (channel, ...args) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  const contextTimer = setInterval(deliverContexts, 300)
  ipcMain.handle('pty:create', (_ev, options: PtyOptions) => {
    const { workspaceId, nodeId, agent, session, role, model, command, worktree } = options
    const { cols = 80, rows = 24, cwd } = options
    const id = nextId++
    // An agent runs inside the user's interactive shell (-i loads .zshrc/.bashrc), so it's found
    // on the same PATH as when typed in a terminal. When the agent quits, the shell ends with it.
    // On Windows it's PowerShell (shell.ts).
    const shell = defaultShell()
    const powershell = isPowerShell(shell)
    // A restored terminal asks for the folder it was in, which may have been deleted since.
    const start = cwd && existsSync(cwd) ? cwd : homedir()
    const known = agent && AGENTS[agent] ? agent : undefined
    const launch: Launch | null = known
      ? agentLaunch({
          agent: known,
          command,
          session,
          role,
          model,
          nodeId,
          worktree,
          cwd: start,
          hooks: known === 'claude' && HOOKS,
          powershell
        })
      : typeof command === 'string' && command.trim()
        ? startupLaunch(command, shell, powershell)
        : null
    // A plain terminal, or one that runs a command first, loads the shell integration
    // (shell.ts): an agent typed in it starts through Nara. An agent node's shell only runs the
    // agent, as it is.
    const integration = known ? { args: [], env: {} } : shellIntegration(shell)
    const args = powershell
      ? powershellArgs(launch?.command, !known)
      : [...integration.args, ...(launch ? ['-ic', launch.command] : [])]
    const term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: start,
      // NARA_PTY is how `nara` tells the app which terminal the message came from.
      env: mergeEnv(ownEnv(), extraEnv, integration.env, launch?.env, { NARA_PTY: String(id) })
    })

    // A killed program can still write on its way out (Claude Code restores the terminal), and
    // by then the window may be gone: sending to it would throw in main.
    term.onData((data) => {
      agentOutput(id, data)
      if (!known) commandOutput(id, workspaceId, nodeId, data)
      const context = contexts.get(id)
      if (context) context.last = Date.now()
      if (!win.isDestroyed()) win.webContents.send('pty:data', id, data)
    })
    term.onExit(({ exitCode }) => {
      agentExited(id, exitCode)
      commandEnded(id)
      contexts.delete(id)
      terminals.delete(id)
      if (!win.isDestroyed()) win.webContents.send('pty:exit', id, exitCode)
    })

    terminals.set(id, { workspaceId, nodeId, term, agent: known })
    // An agent node's files change for as long as its agent runs; a plain terminal's shell marks
    // its commands (changes.ts).
    if (known) commandStarted(id, workspaceId, nodeId, start)
    // The pet follows the agents, not the shells. Messages sent while the agent restarted wait
    // until it's up, like a context.
    const held = holding.get(holdKey(workspaceId, nodeId))
    holding.delete(holdKey(workspaceId, nodeId))
    const message = [launch?.message, ...(held ?? [])].filter(Boolean).join('\n\n') || null
    if (known) startAgent(id, { agent: known, session, message, cwd: start })
    return id
  })

  ipcMain.on('pty:write', (_ev, id: number, data: string) => {
    agentTouched(id, true)
    terminals.get(id)?.term.write(data)
  })
  ipcMain.on('pty:resize', (_ev, id: number, cols: number, rows: number) => {
    agentTouched(id, false)
    terminals.get(id)?.term.resize(cols, rows)
  })
  ipcMain.on('pty:kill', (_ev, id: number) => kill(id))

  // An answer from the pet's command center, to the agent in a node: yes or no to what it asked,
  // or text, which arrives like a message from another agent (pasted, then Enter).
  ipcMain.handle('agents:reply', (_ev, workspaceId: string, nodeId: NodeId, reply: AgentReply) =>
    replyToAgent(workspaceId, nodeId, reply)
  )

  win.on('closed', () => {
    clearInterval(contextTimer)
    contexts.clear()
    for (const id of terminals.keys()) kill(id)
    ipcMain.removeHandler('pty:create')
    ipcMain.removeHandler('agents:reply')
    ipcMain.removeAllListeners('pty:write')
    ipcMain.removeAllListeners('pty:resize')
    ipcMain.removeAllListeners('pty:kill')
  })
}

// What marks a process as running inside a Claude Code session. Opened from a Claude Code
// terminal, Nara would hand these on, and the agents in its nodes would take themselves for
// sub-sessions (that don't save their transcript, among other things). Settings such as
// CLAUDE_CODE_USE_BEDROCK pass through.
const SESSION_MARKERS = new Set([
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT'
])

// PowerShell's command line: the command goes encoded, so nothing in it needs quoting for Windows.
// A plain terminal stays open after its startup command.
function powershellArgs(command: string | undefined, stay: boolean): string[] {
  if (!command) return ['-NoLogo']
  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  return ['-NoLogo', ...(stay ? ['-NoExit'] : []), '-EncodedCommand', encoded]
}

// The environments, the later ones winning. Windows doesn't tell PATH from Path: both would reach
// the shell, and it could take the one without Nara's folder.
function mergeEnv(
  ...envs: (Record<string, string | undefined> | undefined)[]
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {}
  const names = new Map<string, string>()
  for (const env of envs) {
    for (const [key, value] of Object.entries(env ?? {})) {
      const name = process.platform === 'win32' ? key.toUpperCase() : key
      const old = names.get(name)
      if (old !== undefined) delete merged[old]
      names.set(name, key)
      merged[key] = value
    }
  }
  return merged
}

function ownEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !SESSION_MARKERS.has(key))
  )
}

// An answer to the agent in a node, from the pet's command center or the HUD: yes or no to what it
// asked, or text, which arrives like a message from another agent (pasted, then Enter). Returns
// whether it went.
export function replyToAgent(
  workspaceId: string,
  nodeId: NodeId,
  reply: Partial<AgentReply> = {}
): boolean {
  const target = findTerminal(workspaceId, nodeId)
  const key = target && agentOf(target.id)
  const agent = key ? AGENTS[key] : undefined
  if (!target || !agent) return false
  if (reply.kind === 'yes' || reply.kind === 'no') {
    if (!agent.answers) return false
    target.term.write(agent.answers[reply.kind])
  } else if (reply.kind === 'text' && 'text' in reply && String(reply.text ?? '').trim()) {
    send('pty:paste', target.id, String(reply.text).trim())
  } else return false
  agentTouched(target.id, true)
  return true
}

// An agent began in a terminal: one its node opened with, or one typed in a plain terminal (`nara
// run`). The pet and the side panel follow it, what it spends is read where Nara can, and one that
// takes its context as a message gets it once it's up.
export function startAgent(
  id: number,
  {
    agent,
    session,
    message,
    cwd
  }: { agent: string; session?: string; message?: string | null; cwd?: string }
): void {
  const terminal = terminals.get(id)
  if (!terminal || !AGENTS[agent]) return
  terminal.agent = agent
  const { workspaceId, nodeId } = terminal
  trackAgent(id, { workspaceId, nodeId, agent })
  if (AGENTS[agent].telemetry) watchAgent(id, { workspaceId, nodeId, agent, session, cwd })
  if (message) contexts.set(id, { text: message, started: Date.now(), last: 0 })
}

// A CLI Nara doesn't know, started with `nara run`: it only gets its context, as a message.
export function startContext(id: number, message: string | null): void {
  if (terminals.has(id) && message)
    contexts.set(id, { text: message, started: Date.now(), last: 0 })
}

// An agent typed in a plain terminal quit, and the shell is back. A context still waiting goes
// too: pasted into the shell, it would run as commands.
export function endAgent(id: number): void {
  contexts.delete(id)
  const terminal = terminals.get(id)
  if (!terminal?.agent) return
  terminal.agent = undefined
  untrackAgent(id)
  unwatchAgent(id)
}

// The agent in the node is about to restart: messages wait for the new one (holdMessage).
// If the node never restarts (it was closed, or the window reloaded), they go to whatever runs
// there after HOLD_LIMIT, rather than waiting forever.
export function holdMessages(workspaceId: string, nodeId: NodeId): void {
  const key = holdKey(workspaceId, nodeId)
  const held = holding.get(key) ?? []
  holding.set(key, held)
  setTimeout(() => {
    if (holding.get(key) !== held) return
    holding.delete(key)
    const target = findTerminal(workspaceId, nodeId)
    if (target && held.length) {
      contexts.set(target.id, { text: held.join('\n\n'), started: Date.now(), last: 0 })
    }
  }, HOLD_LIMIT)
}

// Keeps a message for an agent that's restarting; false if it isn't.
export function holdMessage(workspaceId: string, nodeId: NodeId, text: string): boolean {
  const held = holding.get(holdKey(workspaceId, nodeId))
  if (!held) return false
  held.push(text)
  return true
}

function deliverContexts(): void {
  const now = Date.now()
  for (const [id, context] of contexts) {
    const quiet = context.last && now - context.last >= CONTEXT_QUIET
    if (!quiet && now - context.started < CONTEXT_WAIT) continue
    contexts.delete(id)
    agentTouched(id, true)
    send('pty:paste', id, context.text)
  }
}

function agentOf(id: number): string | undefined {
  return terminals.get(id)?.agent
}

export function findTerminal(
  workspaceId: string,
  nodeId: NodeId
): (Terminal & { id: number }) | null {
  for (const [id, terminal] of terminals) {
    if (terminal.workspaceId === workspaceId && terminal.nodeId === nodeId) {
      return { id, ...terminal }
    }
  }
  return null
}

// The directory the node's shell is in right now, so the terminal reopens there next time.
// Linux exposes it in /proc and macOS through lsof; elsewhere it isn't tracked.
export function currentCwd(workspaceId: string, nodeId: NodeId): string | undefined {
  const pid = findTerminal(workspaceId, nodeId)?.term.pid
  if (!pid) return undefined
  try {
    if (process.platform === 'linux') return readlinkSync(`/proc/${pid}/cwd`)
    if (process.platform === 'darwin') {
      const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8'
      })
      return out.match(/^n(.+)$/m)?.[1]
    }
  } catch {
    // The shell exited in the meantime.
  }
  return undefined
}

// Resolves once every killed terminal is gone. Electron can't quit while a PTY's process is
// alive (node-pty waits for it), so index.ts holds the quit until then.
export function terminalsExited(): Promise<unknown[]> {
  return Promise.all(exiting)
}

function kill(id: number): void {
  // The agent's state and report go with its node, even when its process has already ended (an
  // agent that failed to start stays on screen, stopped, until its node is closed).
  untrackAgent(id)
  unwatchAgent(id)
  commandEnded(id)
  const terminal = terminals.get(id)
  if (!terminal) return
  terminals.delete(id)
  const { term } = terminal

  // SIGHUP, as when a terminal window closes: a shell saves its history and exits. A program
  // that ignores it would keep running with no terminal (and keep Nara from quitting), so
  // whatever is still there after the grace period gets SIGKILL.
  term.kill()
  const force = setTimeout(() => {
    try {
      process.kill(term.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }, KILL_GRACE)

  const exited = new Promise((resolve) => term.onExit(resolve))
  exiting.add(exited)
  exited.then(() => {
    clearTimeout(force)
    exiting.delete(exited)
  })
}
