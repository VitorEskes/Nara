import { app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { currentCwd } from './pty'

// Each workspace is a canvas saved to its own JSON file, named after a random id so renaming a
// workspace never touches the file. state.json remembers which workspaces were open as tabs and
// which one was active.
//
// The renderer owns the live state and sends a copy on every change. Main keeps the latest copy
// of each open workspace here, which is also where message routing reads the links from, and
// writes it to disk once the changes settle: a single drag produces dozens of updates per second.
const VERSION = 1
const SAVE_DELAY = 1000

export const workspaces = new Map()
const timers = new Map()
// Last JSON written for each workspace, to skip writes that wouldn't change the file.
const written = new Map()

const HANDLERS = ['session', 'list', 'load', 'create', 'close', 'remove']
const LISTENERS = ['save-session', 'update', 'rename']

export function registerWorkspaces(win) {
  // The tabs from the last run, minus any whose file is gone or unreadable. With none left, it
  // starts over with a fresh workspace.
  ipcMain.handle('workspace:session', () => {
    const saved = readJson(statePath()) ?? {}
    const open = (saved.open ?? []).filter(load)
    if (open.length === 0) open.push(create().id)
    const session = { open, active: open.includes(saved.active) ? saved.active : open[0] }
    saveSession(session)
    return session
  })

  ipcMain.on('workspace:save-session', (_ev, session) => saveSession(session))

  ipcMain.handle('workspace:list', () => list())
  ipcMain.handle('workspace:load', (_ev, id) => (load(id) ? workspaces.get(id) : null))
  ipcMain.handle('workspace:create', () => create())

  ipcMain.on('workspace:update', (_ev, id, layout) => change(id, layout))
  ipcMain.on('workspace:rename', (_ev, id, name) => change(id, { name }))

  // The renderer calls this before unmounting the tab, while its shells are still alive to
  // report their directory.
  ipcMain.handle('workspace:close', (_ev, id) => {
    if (!workspaces.has(id)) return
    save(id)
    workspaces.delete(id)
    written.delete(id)
  })

  // Only closed workspaces can be deleted, so this never takes running terminals with it.
  ipcMain.handle('workspace:remove', async (_ev, id) => {
    const name = !workspaces.has(id) && read(id)?.workspace.name
    if (!name) return false
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: `Delete workspace "${name}"?`,
      detail: 'Its terminals, positions and links will be gone for good.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })
    if (response !== 0) return false
    rmSync(workspacePath(id), { force: true })
    return true
  })

  // Saves right away instead of waiting for the timers, while the shells are still alive to
  // report their directory (pty.js kills them on 'closed', which comes after this).
  win.on('close', () => {
    for (const id of workspaces.keys()) save(id)
  })

  win.on('closed', () => {
    workspaces.clear()
    written.clear()
    for (const name of HANDLERS) ipcMain.removeHandler(`workspace:${name}`)
    for (const name of LISTENERS) ipcMain.removeAllListeners(`workspace:${name}`)
  })
}

// Every saved workspace, open or not, sorted by name.
function list() {
  let files
  try {
    files = readdirSync(join(app.getPath('userData'), 'workspaces'))
  } catch {
    return []
  }
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .map((id) => ({ id, name: workspaces.get(id)?.name ?? read(id)?.workspace.name }))
    .filter(({ name }) => name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Brings a workspace into memory. Returns false if its file can't be used.
function load(id) {
  if (workspaces.has(id)) return true
  const file = read(id)
  if (!file) return false
  workspaces.set(id, file.workspace)
  written.set(id, file.json)
  return true
}

// A missing, broken or newer-version file reads as null and is left as it is: new workspaces get
// new files, so nothing is ever overwritten.
function read(id) {
  try {
    const json = readFileSync(workspacePath(id), 'utf8')
    const { version, name, camera, nodes, links } = JSON.parse(json)
    if (version !== VERSION) throw new Error(`unsupported version ${version}`)
    if (!Array.isArray(nodes) || !Array.isArray(links)) throw new Error('malformed file')
    // Files saved before notes existed have no type: back then every node was a terminal.
    const typed = nodes.map((node) => ({ type: 'terminal', ...node }))
    return { json, workspace: { name, camera, nodes: typed, links } }
  } catch (error) {
    console.error(`anbu: could not read workspace ${id}: ${error.message}`)
    return null
  }
}

function create() {
  const id = randomUUID()
  const name = nextName()
  workspaces.set(id, { name, camera: { x: 0, y: 0, z: 1 }, nodes: [], links: [] })
  save(id)
  return { id, name }
}

// "workspace 1", "workspace 2"..., skipping names already taken.
function nextName() {
  const taken = new Set(list().map(({ name }) => name))
  let n = 1
  while (taken.has(`workspace ${n}`)) n++
  return `workspace ${n}`
}

function change(id, patch) {
  if (!workspaces.has(id)) return
  workspaces.set(id, { ...workspaces.get(id), ...patch })
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => save(id), SAVE_DELAY)
  )
}

function save(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)

  const { name, camera, nodes, links } = workspaces.get(id)
  const json = JSON.stringify(
    {
      version: VERSION,
      name,
      camera,
      // The renderer doesn't know where each shell has cd'd to since it started; the OS does.
      nodes: nodes.map((node) =>
        node.type === 'terminal' ? { ...node, cwd: currentCwd(id, node.id) ?? node.cwd } : node
      ),
      links
    },
    null,
    2
  )
  if (json === written.get(id)) return

  try {
    writeAtomic(workspacePath(id), json)
    written.set(id, json)
  } catch (error) {
    console.error(`anbu: could not save workspace ${id}: ${error.message}`)
  }
}

function saveSession({ open, active }) {
  try {
    writeAtomic(statePath(), JSON.stringify({ open, active }, null, 2))
  } catch (error) {
    console.error(`anbu: could not save state: ${error.message}`)
  }
}

// Writes to a temp file and renames it over the old one. The rename is atomic, so a crash
// mid-write leaves the previous file intact instead of a truncated one.
function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, text)
  renameSync(`${file}.tmp`, file)
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function statePath() {
  return join(app.getPath('userData'), 'state.json')
}

// Ids come from the renderer; checking them keeps a bad one from reaching outside the folder.
function workspacePath(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`invalid workspace id: ${id}`)
  return join(app.getPath('userData'), 'workspaces', `${id}.json`)
}
