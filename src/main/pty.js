import { ipcMain } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync, readlinkSync } from 'fs'
import * as pty from 'node-pty'

// Each canvas terminal is a real PTY, identified by an id.
// The renderer never touches node-pty: everything goes through IPC.
// Also stores the workspace and canvas node that own the PTY: links are between nodes, not PTYs,
// and node ids are only unique within a workspace.
export const terminals = new Map()
let nextId = 1

// `extraEnv` holds the variables every terminal gets (the ones the `anbu` command uses).
export function registerPty(win, extraEnv) {
  ipcMain.handle('pty:create', (_ev, options = {}) => {
    const { workspaceId, nodeId, cmd, args = [], cols = 80, rows = 24, cwd } = options
    const id = nextId++
    const term = pty.spawn(cmd || process.env.SHELL || 'bash', args, {
      name: 'xterm-256color',
      cols,
      rows,
      // A restored terminal asks for the folder it was in, which may have been deleted since.
      cwd: cwd && existsSync(cwd) ? cwd : process.env.HOME,
      // ANBU_PTY is how `anbu` tells the app which terminal the message came from.
      env: { ...process.env, ...extraEnv, ANBU_PTY: String(id) }
    })

    term.onData((data) => win.webContents.send('pty:data', id, data))
    term.onExit(({ exitCode }) => {
      terminals.delete(id)
      if (!win.isDestroyed()) win.webContents.send('pty:exit', id, exitCode)
    })

    terminals.set(id, { workspaceId, nodeId, term })
    return id
  })

  ipcMain.on('pty:write', (_ev, id, data) => terminals.get(id)?.term.write(data))
  ipcMain.on('pty:resize', (_ev, id, cols, rows) => terminals.get(id)?.term.resize(cols, rows))
  ipcMain.on('pty:kill', (_ev, id) => kill(id))

  win.on('closed', () => {
    for (const id of terminals.keys()) kill(id)
    ipcMain.removeHandler('pty:create')
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

function kill(id) {
  terminals.get(id)?.term.kill()
  terminals.delete(id)
}
