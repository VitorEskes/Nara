import { ipcMain } from 'electron'
import * as pty from 'node-pty'

// Cada terminal do canvas é um PTY de verdade, identificado por um id.
// O renderer nunca toca no node-pty: tudo passa por IPC.
// Guarda também o nó do canvas dono do PTY: as ligações são entre nós, não entre PTYs.
export const terminais = new Map()
let proximoId = 1

// `ambiente` são as variáveis extras de todo terminal (as que o comando `anbu` usa).
export function registrarPty(janela, ambiente) {
  ipcMain.handle('pty:criar', (_ev, { no, cmd, args = [], cols = 80, rows = 24, cwd } = {}) => {
    const id = proximoId++
    const term = pty.spawn(cmd || process.env.SHELL || 'bash', args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || process.env.HOME,
      // ANBU_PTY é como o `anbu` diz ao app de qual terminal a mensagem saiu.
      env: { ...process.env, ...ambiente, ANBU_PTY: String(id) }
    })

    term.onData((dados) => janela.webContents.send('pty:dados', id, dados))
    term.onExit(({ exitCode }) => {
      terminais.delete(id)
      if (!janela.isDestroyed()) janela.webContents.send('pty:saiu', id, exitCode)
    })

    terminais.set(id, { no, term })
    return id
  })

  ipcMain.on('pty:escrever', (_ev, id, dados) => terminais.get(id)?.term.write(dados))
  ipcMain.on('pty:redimensionar', (_ev, id, cols, rows) =>
    terminais.get(id)?.term.resize(cols, rows)
  )
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
  terminais.get(id)?.term.kill()
  terminais.delete(id)
}
