import { contextBridge, ipcRenderer } from 'electron'

// The bridge between the renderer (React) and main (node-pty).
// The `on*` functions return a function that unsubscribes.
const api = {
  pty: {
    create: (options) => ipcRenderer.invoke('pty:create', options),
    pickFolder: (agent) => ipcRenderer.invoke('pty:pick-folder', agent),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (fn) => listen('pty:data', fn),
    onExit: (fn) => listen('pty:exit', fn),
    onPaste: (fn) => listen('pty:paste', fn)
  },
  workspace: {
    session: () => ipcRenderer.invoke('workspace:session'),
    saveSession: (session) => ipcRenderer.send('workspace:save-session', session),
    list: () => ipcRenderer.invoke('workspace:list'),
    load: (id) => ipcRenderer.invoke('workspace:load', id),
    create: () => ipcRenderer.invoke('workspace:create'),
    update: (id, layout) => ipcRenderer.send('workspace:update', id, layout),
    rename: (id, name) => ipcRenderer.send('workspace:rename', id, name),
    close: (id) => ipcRenderer.invoke('workspace:close', id),
    remove: (id) => ipcRenderer.invoke('workspace:remove', id),
    onNoteWritten: (fn) => listen('workspace:note-written', fn)
  }
}

function listen(channel, fn) {
  const listener = (_ev, ...args) => fn(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
