import { contextBridge, ipcRenderer } from 'electron'

// The bridge between the renderer (React) and main (node-pty).
// The `on*` functions return a function that unsubscribes.
const api = {
  pty: {
    create: (options) => ipcRenderer.invoke('pty:create', options),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (fn) => listen('pty:data', fn),
    onExit: (fn) => listen('pty:exit', fn),
    onPaste: (fn) => listen('pty:paste', fn)
  },
  links: {
    set: (list) => ipcRenderer.send('links:set', list)
  }
}

function listen(channel, fn) {
  const listener = (_ev, ...args) => fn(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
