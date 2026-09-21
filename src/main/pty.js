import { ipcMain } from 'electron'
import * as pty from 'node-pty'

// Cada terminal do canvas é um PTY de verdade, identificado por um id.
// O renderer nunca toca no node-pty: tudo passa por IPC.
const terminais = new Map()
let proximoId = 1

export function registrarPty(janela) {
  ipcMain.handle('pty:criar', (_ev, { cmd, args = [], cols = 80, rows = 24, cwd } = {}) => {
    const id = proximoId++
    const term = pty.spawn(cmd || process.env.SHELL || 'bash', args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || process.env.HOME,
      env: process.env
    })

    term.onData((dados) => janela.webContents.send('pty:dados', id, dados))
    term.onExit(({ exitCode }) => {
      terminais.delete(id)
      if (!janela.isDestroyed()) janela.webContents.send('pty:saiu', id, exitCode)
    })

    terminais.set(id, term)
    return id
  })

  ipcMain.on('pty:escrever', (_ev, id, dados) => terminais.get(id)?.write(dados))
  ipcMain.on('pty:redimensionar', (_ev, id, cols, rows) => terminais.get(id)?.resize(cols, rows))
  ipcMain.on('pty:matar', (_ev, id) => matar(id))

  janela.on('closed', () => {
    for (const id of terminais.keys()) matar(id)
    ipcMain.removeHandler('pty:criar')
    ipcMain.removeAllListeners('pty:escrever')
    ipcMain.removeAllListeners('pty:redimensionar')
    ipcMain.removeAllListeners('pty:matar')
  })
}

function matar(id) {
  terminais.get(id)?.kill()
  terminais.delete(id)
}
