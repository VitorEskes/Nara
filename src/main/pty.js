import { ipcMain } from 'electron'
import * as pty from 'node-pty'

// Each canvas terminal is a real PTY, identified by an id.
// The renderer never touches node-pty: everything goes through IPC.
// Also stores the canvas node that owns the PTY: links are between nodes, not PTYs.
export const terminals = new Map()
let nextId = 1

// `extraEnv` holds the variables every terminal gets (the ones the `anbu` command uses).
export function registerPty(win, extraEnv) {
  ipcMain.handle(
    'pty:create',
    (_ev, { nodeId, cmd, args = [], cols = 80, rows = 24, cwd } = {}) => {
      const id = nextId++
      const term = pty.spawn(cmd || process.env.SHELL || 'bash', args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd || process.env.HOME,
        // ANBU_PTY is how `anbu` tells the app which terminal the message came from.
        env: { ...process.env, ...extraEnv, ANBU_PTY: String(id) }
      })

      term.onData((data) => win.webContents.send('pty:data', id, data))
      term.onExit(({ exitCode }) => {
        terminals.delete(id)
        if (!win.isDestroyed()) win.webContents.send('pty:exit', id, exitCode)
      })

      terminals.set(id, { nodeId, term })
      return id
    }
  )

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

function kill(id) {
  terminals.get(id)?.term.kill()
  terminals.delete(id)
}
