import { contextBridge, ipcRenderer } from 'electron'

// A ponte entre o renderer (React) e o main (node-pty).
// Os `on*` devolvem uma função que desfaz a inscrição.
const api = {
  pty: {
    criar: (opcoes) => ipcRenderer.invoke('pty:criar', opcoes),
    escrever: (id, dados) => ipcRenderer.send('pty:escrever', id, dados),
    redimensionar: (id, cols, rows) => ipcRenderer.send('pty:redimensionar', id, cols, rows),
    matar: (id) => ipcRenderer.send('pty:matar', id),
    aoReceber: (fn) => ouvir('pty:dados', fn),
    aoSair: (fn) => ouvir('pty:saiu', fn),
    aoColar: (fn) => ouvir('pty:colar', fn)
  },
  ligacoes: {
    definir: (lista) => ipcRenderer.send('ligacoes:definir', lista)
  }
}

function ouvir(canal, fn) {
  const ouvinte = (_ev, ...args) => fn(...args)
  ipcRenderer.on(canal, ouvinte)
  return () => ipcRenderer.removeListener(canal, ouvinte)
}

contextBridge.exposeInMainWorld('api', api)
