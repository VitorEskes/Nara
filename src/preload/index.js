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
  workspace: {
    session: () => ipcRenderer.invoke('workspace:session'),
    saveSession: (session) => ipcRenderer.send('workspace:save-session', session),
    list: () => ipcRenderer.invoke('workspace:list'),
    load: (id) => ipcRenderer.invoke('workspace:load', id),
    // projectId is optional: without it the workspace is a loose one.
    create: (projectId) => ipcRenderer.invoke('workspace:create', projectId),
    pickFolder: (id) => ipcRenderer.invoke('workspace:pick-folder', id),
    update: (id, layout) => ipcRenderer.send('workspace:update', id, layout),
    rename: (id, name) => ipcRenderer.send('workspace:rename', id, name),
    close: (id) => ipcRenderer.invoke('workspace:close', id),
    remove: (id) => ipcRenderer.invoke('workspace:remove', id),
    onNoteWritten: (fn) => listen('workspace:note-written', fn)
  },
  theme: {
    // 'light', 'dark' or 'system'.
    get: () => ipcRenderer.invoke('theme:get'),
    set: (theme) => ipcRenderer.send('theme:set', theme)
  },
  roles: {
    // The roles the user made; the built-in ones are in shared/roles.js.
    list: () => ipcRenderer.invoke('roles:list'),
    save: (role) => ipcRenderer.invoke('roles:save', role),
    remove: (key) => ipcRenderer.invoke('roles:remove', key)
  },
  folder: {
    pick: (defaultPath) => ipcRenderer.invoke('folder:pick', defaultPath),
    // { path, short, exists, branch } for the folder a terminal would open in.
    info: (path) => ipcRenderer.invoke('folder:info', path)
  },
  agents: {
    // [{ workspaceId, nodeId, agent, state, since, title, workspace }]; state is 'idle',
    // 'working', 'waiting', 'review' or 'failed'.
    status: () => ipcRenderer.invoke('agents:status'),
    onStatus: (fn) => listen('agents:status', fn),
    seen: (workspaceId, nodeId) => ipcRenderer.send('agents:seen', workspaceId, nodeId),
    // reply: { kind: 'yes' | 'no' } or { kind: 'text', text }.
    reply: (workspaceId, nodeId, reply) =>
      ipcRenderer.invoke('agents:reply', workspaceId, nodeId, reply),
    // The HUD sent the user to an agent.
    onJump: (fn) => listen('agents:jump', fn)
  },
  voice: {
    // Binds the bar's global shortcut, or lets it go; returns whether it's bound.
    enable: (on) => ipcRenderer.invoke('voice:enable', on),
    // Opens the bar, ready to send to `target` ({ workspaceId, nodeId }) if given.
    open: (target) => ipcRenderer.send('voice:open', target ?? null),
    hide: () => ipcRenderer.send('voice:hide'),
    onOpened: (fn) => listen('voice:opened', fn),
    // The opening that came before the page was ready: { target } or null.
    take: () => ipcRenderer.invoke('voice:take'),
    settings: () => ipcRenderer.invoke('voice:settings'),
    save: (patch) => ipcRenderer.invoke('voice:save', patch),
    // A WAV (ArrayBuffer) -> { text } or { error }.
    transcribe: (wav) => ipcRenderer.invoke('voice:transcribe', wav)
  },
  notes: {
    // Asks for an image and keeps a copy: { url, name } or null.
    pickImage: () => ipcRenderer.invoke('notes:pick-image'),
    // Keeps a pasted image (its bytes and MIME type): { url } or null.
    saveImage: (bytes, type) => ipcRenderer.invoke('notes:save-image', bytes, type)
  },
  git: {
    // A worktree of the folder's repository on a new branch: { path, branch, base, root } or
    // { error }.
    worktree: (folder, name) => ipcRenderer.invoke('git:worktree', folder, name),
    // { branch, files: [{ path, status, added, removed }] } or null outside a repository.
    changes: (folder) => ipcRenderer.invoke('git:changes', folder),
    diff: (folder, file, untracked) => ipcRenderer.invoke('git:diff', folder, file, untracked),
    merge: (worktree) => ipcRenderer.invoke('git:merge', worktree),
    removeWorktree: (worktree) => ipcRenderer.invoke('git:remove-worktree', worktree)
  },
  telemetry: {
    // [{ workspaceId, nodeId, agent, model, title, usage, tasks, activity, lines }], each agent's
    // report (main/telemetry.js); an update can carry { workspaceId, nodeId, removed: true }.
    list: () => ipcRenderer.invoke('telemetry:list'),
    onUpdate: (fn) => listen('telemetry:update', fn)
  },
  hud: {
    enable: (on) => ipcRenderer.invoke('hud:enable', on),
    toggle: () => ipcRenderer.send('hud:toggle'),
    hide: () => ipcRenderer.send('hud:hide'),
    jump: (status) => ipcRenderer.send('hud:jump', status)
  },
  pets: {
    list: () => ipcRenderer.invoke('pets:list'),
    sprite: (id) => ipcRenderer.invoke('pets:sprite', id),
    // 'nara' or 'codex'.
    open: (source) => ipcRenderer.invoke('pets:open', source),
    folders: () => ipcRenderer.invoke('pets:folders'),
    // Asks for a Codex pet (its pet.json or a .zip) and adds it: { id }, { error } or null.
    import: () => ipcRenderer.invoke('pets:import')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openData: () => ipcRenderer.invoke('app:open-data')
  },
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    create: () => ipcRenderer.invoke('project:create'),
    rename: (id, name) => ipcRenderer.send('project:rename', id, name),
    remove: (id) => ipcRenderer.invoke('project:remove', id)
  }
}

function listen(channel, fn) {
  const listener = (_ev, ...args) => fn(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
