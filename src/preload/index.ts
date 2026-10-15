import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AgentReply,
  AgentReport,
  AgentStatus,
  AgentTarget,
  AppInfo,
  BrowserKey,
  CodeListing,
  CodeRead,
  CodeWrite,
  FolderInfo,
  GitChanges,
  Limits,
  MergeResult,
  NewWorkspace,
  NodeId,
  PetConfig,
  PetInfo,
  Project,
  RemovedReport,
  Result,
  ReviewItem,
  ReviewOriginal,
  Role,
  SavedRole,
  Session,
  VoiceSettings,
  Workspace,
  WorkspaceLayout,
  WorkspaceSummary,
  Worktree
} from '../shared/types'

// What a terminal opens with (main/pty.ts): an agent and its session, role and command, or a
// plain shell, in a folder.
export interface PtyOptions {
  workspaceId: string
  nodeId: NodeId
  agent?: string
  session?: string
  role?: string
  command?: string
  cwd?: string
  worktree?: { branch: string; base: string }
  cols?: number
  rows?: number
}

export type Theme = 'light' | 'dark' | 'system'

// The bridge between the renderer (React) and main (node-pty).
// The `on*` functions return a function that unsubscribes.
const api = {
  pty: {
    create: (options: PtyOptions): Promise<number> => ipcRenderer.invoke('pty:create', options),
    write: (id: number, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('pty:kill', id),
    onData: (fn: (id: number, data: string) => void) => listen('pty:data', fn),
    onExit: (fn: (id: number, code: number) => void) => listen('pty:exit', fn),
    onPaste: (fn: (id: number, text: string) => void) => listen('pty:paste', fn)
  },
  workspace: {
    session: (): Promise<Session> => ipcRenderer.invoke('workspace:session'),
    saveSession: (session: Session) => ipcRenderer.send('workspace:save-session', session),
    list: (): Promise<WorkspaceSummary[]> => ipcRenderer.invoke('workspace:list'),
    load: (id: string): Promise<Workspace | null> => ipcRenderer.invoke('workspace:load', id),
    // projectId is optional: without it the workspace is a loose one.
    create: (projectId?: string): Promise<NewWorkspace | null> =>
      ipcRenderer.invoke('workspace:create', projectId),
    pickFolder: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('workspace:pick-folder', id),
    update: (id: string, layout: WorkspaceLayout) =>
      ipcRenderer.send('workspace:update', id, layout),
    rename: (id: string, name: string) => ipcRenderer.send('workspace:rename', id, name),
    close: (id: string): Promise<void> => ipcRenderer.invoke('workspace:close', id),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('workspace:remove', id),
    onNoteWritten: (fn: (workspaceId: string, nodeId: NodeId, text: string) => void) =>
      listen('workspace:note-written', fn)
  },
  theme: {
    // 'light', 'dark' or 'system'.
    get: (): Promise<Theme> => ipcRenderer.invoke('theme:get'),
    set: (theme: Theme) => ipcRenderer.send('theme:set', theme)
  },
  roles: {
    // The roles the user made; the built-in ones are in shared/roles.js.
    list: (): Promise<SavedRole[]> => ipcRenderer.invoke('roles:list'),
    save: (role: Role): Promise<SavedRole | null> => ipcRenderer.invoke('roles:save', role),
    remove: (key: string): Promise<boolean> => ipcRenderer.invoke('roles:remove', key)
  },
  folder: {
    pick: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('folder:pick', defaultPath),
    // { path, short, exists, branch } for the folder a terminal would open in.
    info: (path?: string): Promise<FolderInfo> => ipcRenderer.invoke('folder:info', path)
  },
  agents: {
    // [{ workspaceId, nodeId, agent, state, since, title, workspace }]; state is 'idle',
    // 'working', 'waiting', 'review' or 'failed'.
    status: (): Promise<AgentStatus[]> => ipcRenderer.invoke('agents:status'),
    onStatus: (fn: (statuses: AgentStatus[]) => void) => listen('agents:status', fn),
    seen: (workspaceId: string, nodeId: NodeId) =>
      ipcRenderer.send('agents:seen', workspaceId, nodeId),
    // reply: { kind: 'yes' | 'no' } or { kind: 'text', text }.
    reply: (workspaceId: string, nodeId: NodeId, reply: AgentReply): Promise<boolean> =>
      ipcRenderer.invoke('agents:reply', workspaceId, nodeId, reply),
    // The HUD sent the user to an agent.
    onJump: (fn: (status: AgentStatus) => void) => listen('agents:jump', fn)
  },
  voice: {
    // Binds the bar's global shortcut, or lets it go; returns whether it's bound.
    enable: (on: boolean): Promise<boolean> => ipcRenderer.invoke('voice:enable', on),
    // Opens the bar, ready to send to `target` ({ workspaceId, nodeId }) if given.
    open: (target?: AgentTarget | null) => ipcRenderer.send('voice:open', target ?? null),
    hide: () => ipcRenderer.send('voice:hide'),
    onOpened: (fn: (target: AgentTarget | null) => void) => listen('voice:opened', fn),
    // The opening that came before the page was ready: { target } or null.
    take: (): Promise<{ target: AgentTarget | null } | null> => ipcRenderer.invoke('voice:take'),
    settings: (): Promise<VoiceSettings> => ipcRenderer.invoke('voice:settings'),
    save: (patch: Partial<VoiceSettings>): Promise<VoiceSettings> =>
      ipcRenderer.invoke('voice:save', patch),
    // How far the voice model's first download has got, 0 to 1.
    onProgress: (fn: (progress: number) => void) => listen('voice:progress', fn),
    // A WAV (ArrayBuffer) -> { text } or { error }.
    transcribe: (
      wav: ArrayBuffer
    ): Promise<{ text: string; error?: undefined } | { error: string }> =>
      ipcRenderer.invoke('voice:transcribe', wav)
  },
  notes: {
    // Asks for an image and keeps a copy: { url, name } or null.
    pickImage: (): Promise<{ url: string; name: string } | null> =>
      ipcRenderer.invoke('notes:pick-image'),
    // Keeps a pasted image (its bytes and MIME type): { url } or null.
    saveImage: (bytes: ArrayBuffer, type: string): Promise<{ url: string } | null> =>
      ipcRenderer.invoke('notes:save-image', bytes, type)
  },
  git: {
    // A worktree of the folder's repository on a new branch: { path, branch, base, root } or
    // { error }.
    worktree: (
      folder: string,
      name?: string
    ): Promise<(Worktree & { error?: undefined }) | { error: string }> =>
      ipcRenderer.invoke('git:worktree', folder, name),
    // { branch, files: [{ path, status, added, removed }] } or null outside a repository.
    changes: (folder?: string): Promise<GitChanges | null> =>
      ipcRenderer.invoke('git:changes', folder),
    diff: (folder: string, file: string, untracked: boolean): Promise<string> =>
      ipcRenderer.invoke('git:diff', folder, file, untracked),
    merge: (worktree: Worktree): Promise<Result> => ipcRenderer.invoke('git:merge', worktree),
    removeWorktree: (worktree: Worktree): Promise<Result> =>
      ipcRenderer.invoke('git:remove-worktree', worktree)
  },
  browser: {
    // A browser node's page, so `nara browser` in a linked terminal can drive and read it
    // (main/browser.js). `contentsId` is its webview's webContents id.
    attach: (workspaceId: string, nodeId: NodeId, contentsId: number) =>
      ipcRenderer.send('browser:attach', workspaceId, nodeId, contentsId),
    detach: (workspaceId: string, nodeId: NodeId) =>
      ipcRenderer.send('browser:detach', workspaceId, nodeId),
    // An app shortcut pressed while a page had the keyboard: { code, key, shift }.
    onKey: (fn: (key: BrowserKey) => void) => listen('browser:key', fn)
  },
  code: {
    // Every path is absolute and has to be inside one of the workspace's folders (main/code.js).
    // { files, status, repo, truncated } for a folder; files are relative to it.
    list: (workspaceId: string, root: string): Promise<CodeListing | { error: string }> =>
      ipcRenderer.invoke('code:list', workspaceId, root),
    // { text, mtime } or { error }.
    read: (workspaceId: string, path: string): Promise<CodeRead> =>
      ipcRenderer.invoke('code:read', workspaceId, path),
    // { mtime }, { conflict: true } if the file changed since `mtime`, or { error }.
    write: (
      workspaceId: string,
      path: string,
      text: string,
      mtime: number | null
    ): Promise<CodeWrite> => ipcRenderer.invoke('code:write', workspaceId, path, text, mtime),
    // kind: 'file' or 'folder'.
    create: (workspaceId: string, path: string, kind: 'file' | 'folder'): Promise<Result> =>
      ipcRenderer.invoke('code:create', workspaceId, path, kind),
    rename: (workspaceId: string, from: string, to: string): Promise<Result> =>
      ipcRenderer.invoke('code:rename', workspaceId, from, to),
    trash: (workspaceId: string, path: string): Promise<Result> =>
      ipcRenderer.invoke('code:trash', workspaceId, path),
    reveal: (workspaceId: string, path: string): Promise<void> =>
      ipcRenderer.invoke('code:reveal', workspaceId, path),
    // The files open in the editor; onChanged hears when one of them changes on disk.
    watch: (paths: string[]) => ipcRenderer.send('code:watch', paths),
    onChanged: (fn: (path: string) => void) => listen('code:changed', fn)
  },
  review: {
    // What the workspace's agents changed, one item per repository (main/review.js).
    queue: (workspaceId: string): Promise<ReviewItem[]> =>
      ipcRenderer.invoke('review:queue', workspaceId),
    // `path` is relative to the item's folder; `commit` is the item's baseCommit.
    original: (
      workspaceId: string,
      folder: string,
      path: string,
      commit: string
    ): Promise<ReviewOriginal> =>
      ipcRenderer.invoke('review:original', workspaceId, folder, path, commit),
    discard: (workspaceId: string, folder: string, path: string, commit: string): Promise<Result> =>
      ipcRenderer.invoke('review:discard', workspaceId, folder, path, commit),
    commit: (workspaceId: string, folder: string, message: string): Promise<Result> =>
      ipcRenderer.invoke('review:commit', workspaceId, folder, message),
    // { ok }, { conflict: [paths] } or { error }; `message` commits what isn't committed first.
    merge: (workspaceId: string, folder: string, message?: string): Promise<MergeResult> =>
      ipcRenderer.invoke('review:merge', workspaceId, folder, message)
  },
  usage: {
    // { claude?, codex? }: each { fiveHour, sevenDay, updated }, a window being { used, resetsAt }.
    get: (): Promise<Limits> => ipcRenderer.invoke('usage:get'),
    onUpdate: (fn: (limits: Limits) => void) => listen('usage:update', fn)
  },
  telemetry: {
    // [{ workspaceId, nodeId, agent, model, title, usage, tasks, activity, lines }], each agent's
    // report (main/telemetry.js); an update can carry { workspaceId, nodeId, removed: true }.
    list: (): Promise<AgentReport[]> => ipcRenderer.invoke('telemetry:list'),
    onUpdate: (fn: (reports: (AgentReport | RemovedReport)[]) => void) =>
      listen('telemetry:update', fn)
  },
  hud: {
    enable: (on: boolean): Promise<boolean> => ipcRenderer.invoke('hud:enable', on),
    toggle: () => ipcRenderer.send('hud:toggle'),
    hide: () => ipcRenderer.send('hud:hide'),
    jump: (status: AgentStatus) => ipcRenderer.send('hud:jump', status)
  },
  pet: {
    // The app tells main which pet is out on the desktop, if any: { pet, size } (main/pet.js).
    configure: (config: PetConfig) => ipcRenderer.send('pet:configure', config),
    // The rest is the desktop pet's own window (main/petProcess.js).
    prefs: (): Promise<PetConfig> => ipcRenderer.invoke('pet:prefs'),
    onPrefs: (fn: (prefs: PetConfig) => void) => listen('pet:prefs', fn),
    // The rectangles it draws in, in its pixels: only those take the pointer.
    shape: (rects: { x: number; y: number; width: number; height: number }[]) =>
      ipcRenderer.send('pet:shape', rects),
    dragStart: () => ipcRenderer.send('pet:drag-start'),
    dragEnd: () => ipcRenderer.send('pet:drag-end'),
    jump: (status: AgentStatus) => ipcRenderer.send('pet:jump', status)
  },
  pets: {
    list: (): Promise<PetInfo[]> => ipcRenderer.invoke('pets:list'),
    sprite: (id: string): Promise<string | null> => ipcRenderer.invoke('pets:sprite', id),
    // 'nara' or 'codex'.
    open: (source: 'nara' | 'codex'): Promise<boolean> => ipcRenderer.invoke('pets:open', source),
    folders: (): Promise<Record<'nara' | 'codex', boolean>> => ipcRenderer.invoke('pets:folders'),
    // Asks for a Codex pet (its pet.json or a .zip) and adds it: { id }, { error } or null.
    import: (): Promise<{ id: string; error?: undefined } | { error: string } | null> =>
      ipcRenderer.invoke('pets:import')
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    openData: (): Promise<string> => ipcRenderer.invoke('app:open-data')
  },
  project: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('project:list'),
    create: (): Promise<{ project: Project; workspace: NewWorkspace } | null> =>
      ipcRenderer.invoke('project:create'),
    rename: (id: string, name: string) => ipcRenderer.send('project:rename', id, name),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('project:remove', id)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listen<Args extends any[]>(channel: string, fn: (...args: Args) => void): () => void {
  const listener = (_ev: IpcRendererEvent, ...args: unknown[]): void => fn(...(args as Args))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
