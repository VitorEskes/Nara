import { ipcMain } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync, readlinkSync } from 'fs'
import * as pty from 'node-pty'
import { AGENTS } from '../shared/agents'
import { agentLaunch, startupLaunch } from './agents'
import { agentExited, agentOutput, agentTouched, trackAgent, untrackAgent } from './status'
import { unwatchAgent, watchAgent } from './telemetry'

// Each canvas terminal is a real PTY, identified by an id.
// The renderer never touches node-pty: everything goes through IPC.
// Also stores the workspace and canvas node that own the PTY: links are between nodes, not PTYs,
// and node ids are only unique within a workspace.
export const terminals = new Map()
let nextId = 1
// Claude Code's hooks that tell Nara, through the `nara` command, when the agent takes a prompt,
// ends its turn and asks for something (status.js), more reliably than its output can.
const HOOKS = Object.fromEntries(
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
const exiting = new Set()

// `extraEnv` holds the variables every terminal gets (the ones the `nara` command uses).
export function registerPty(win, extraEnv) {
  ipcMain.handle('pty:create', (_ev, options = {}) => {
    const { workspaceId, nodeId, agent, session, role, command, worktree } = options
    const { cols = 80, rows = 24, cwd } = options
    const id = nextId++
    // An agent runs inside the user's interactive shell (-i loads .zshrc/.bashrc), so it's found
    // on the same PATH as when typed in a terminal. When the agent quits, the shell ends with it.
    const shell = process.env.SHELL || 'bash'
    const launch = AGENTS[agent]
      ? agentLaunch({
          agent,
          command,
          session,
          role,
          nodeId,
          worktree,
          hooks: agent === 'claude' && HOOKS
        })
      : typeof command === 'string' && command.trim()
        ? startupLaunch(command, shell)
        : null
    const args = launch ? ['-ic', launch.command] : []
    const start = cwd && existsSync(cwd) ? cwd : process.env.HOME
    const term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      // A restored terminal asks for the folder it was in, which may have been deleted since.
      cwd: start,
      // NARA_PTY is how `nara` tells the app which terminal the message came from.
      env: { ...ownEnv(), ...extraEnv, ...launch?.env, NARA_PTY: String(id) }
    })

    // A killed program can still write on its way out (Claude Code restores the terminal), and
    // by then the window may be gone: sending to it would throw in main.
    term.onData((data) => {
      agentOutput(id, data)
      if (!win.isDestroyed()) win.webContents.send('pty:data', id, data)
    })
    term.onExit(({ exitCode }) => {
      agentExited(id, exitCode)
      terminals.delete(id)
      if (!win.isDestroyed()) win.webContents.send('pty:exit', id, exitCode)
    })

    terminals.set(id, { workspaceId, nodeId, term, agent: AGENTS[agent] ? agent : undefined })
    // The pet follows the agents, not the shells.
    if (AGENTS[agent]) {
      trackAgent(id, { workspaceId, nodeId, agent })
      watchAgent(id, { workspaceId, nodeId, agent, session, cwd: start })
    }
    return id
  })

  ipcMain.on('pty:write', (_ev, id, data) => {
    agentTouched(id, true)
    terminals.get(id)?.term.write(data)
  })
  ipcMain.on('pty:resize', (_ev, id, cols, rows) => {
    agentTouched(id, false)
    terminals.get(id)?.term.resize(cols, rows)
  })
  ipcMain.on('pty:kill', (_ev, id) => kill(id))

  // An answer from the pet's command center, to the agent in a node: yes or no to what it asked,
  // or text, which arrives like a message from another agent (pasted, then Enter).
  ipcMain.handle('agents:reply', (_ev, workspaceId, nodeId, reply = {}) => {
    const target = findTerminal(workspaceId, nodeId)
    const agent = AGENTS[target && agentOf(target.id)]
    if (!target || !agent) return false
    if (reply.kind === 'yes' || reply.kind === 'no') {
      target.term.write(agent.answers[reply.kind])
    } else if (reply.kind === 'text' && String(reply.text ?? '').trim()) {
      if (win.isDestroyed()) return false
      win.webContents.send('pty:paste', target.id, String(reply.text).trim())
    } else return false
    agentTouched(target.id, true)
    return true
  })

  win.on('closed', () => {
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

function ownEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !SESSION_MARKERS.has(key))
  )
}

function agentOf(id) {
  return terminals.get(id)?.agent
}

export function findTerminal(workspaceId, nodeId) {
  for (const [id, terminal] of terminals) {
    if (terminal.workspaceId === workspaceId && terminal.nodeId === nodeId) {
      return { id, ...terminal }
    }
  }
  return null
}

// The directory the node's shell is in right now, so the terminal reopens there next time.
// Linux exposes it in /proc and macOS through lsof; elsewhere it isn't tracked.
export function currentCwd(workspaceId, nodeId) {
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
// alive (node-pty waits for it), so index.js holds the quit until then.
export function terminalsExited() {
  return Promise.all(exiting)
}

function kill(id) {
  const terminal = terminals.get(id)
  if (!terminal) return
  terminals.delete(id)
  untrackAgent(id)
  unwatchAgent(id)
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
