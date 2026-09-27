import { dialog, ipcMain } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync, readlinkSync } from 'fs'
import * as pty from 'node-pty'
import { AGENTS } from '../shared/agents'
import { agentCommand } from './agents'

// Each canvas terminal is a real PTY, identified by an id.
// The renderer never touches node-pty: everything goes through IPC.
// Also stores the workspace and canvas node that own the PTY: links are between nodes, not PTYs,
// and node ids are only unique within a workspace.
export const terminals = new Map()
let nextId = 1
// Where the folder picker opens: the folder of the last agent opened.
let lastFolder = process.env.HOME
// How long a killed terminal gets to exit on its own before it's killed outright.
const KILL_GRACE = 2000
// Exits still pending from kill().
const exiting = new Set()

// `extraEnv` holds the variables every terminal gets (the ones the `anbu` command uses).
export function registerPty(win, extraEnv) {
  ipcMain.handle('pty:create', (_ev, options = {}) => {
    const { workspaceId, nodeId, agent, session, cols = 80, rows = 24, cwd } = options
    const id = nextId++
    // An agent runs inside the user's interactive shell (-i loads .zshrc/.bashrc), so it's found
    // on the same PATH as when typed in a terminal. When the agent quits, the shell ends with it.
    const args = AGENTS[agent] ? ['-ic', agentCommand(agent, session)] : []
    const term = pty.spawn(process.env.SHELL || 'bash', args, {
      name: 'xterm-256color',
      cols,
      rows,
      // A restored terminal asks for the folder it was in, which may have been deleted since.
      cwd: cwd && existsSync(cwd) ? cwd : process.env.HOME,
      // ANBU_PTY is how `anbu` tells the app which terminal the message came from.
      env: { ...process.env, ...extraEnv, ANBU_PTY: String(id) }
    })

    // A killed program can still write on its way out (Claude Code restores the terminal), and
    // by then the window may be gone: sending to it would throw in main.
    term.onData((data) => {
      if (!win.isDestroyed()) win.webContents.send('pty:data', id, data)
    })
    term.onExit(({ exitCode }) => {
      terminals.delete(id)
      if (!win.isDestroyed()) win.webContents.send('pty:exit', id, exitCode)
    })

    terminals.set(id, { workspaceId, nodeId, term })
    return id
  })

  // An agent starts in the folder it will work on: unlike a shell, it has no prompt to cd from.
  ipcMain.handle('pty:pick-folder', async (_ev, agent) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Open ${AGENTS[agent]?.label ?? 'agent'} in…`,
      defaultPath: lastFolder,
      buttonLabel: 'Open here',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths[0]) return null
    lastFolder = filePaths[0]
    return lastFolder
  })

  ipcMain.on('pty:write', (_ev, id, data) => terminals.get(id)?.term.write(data))
  ipcMain.on('pty:resize', (_ev, id, cols, rows) => terminals.get(id)?.term.resize(cols, rows))
  ipcMain.on('pty:kill', (_ev, id) => kill(id))

  win.on('closed', () => {
    for (const id of terminals.keys()) kill(id)
    ipcMain.removeHandler('pty:create')
    ipcMain.removeHandler('pty:pick-folder')
    ipcMain.removeAllListeners('pty:write')
    ipcMain.removeAllListeners('pty:resize')
    ipcMain.removeAllListeners('pty:kill')
  })
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
  const { term } = terminal

  // SIGHUP, as when a terminal window closes: a shell saves its history and exits. A program
  // that ignores it would keep running with no terminal (and keep anbu from quitting), so
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
