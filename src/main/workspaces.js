import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { currentCwd } from './pty'

// Each workspace is a canvas saved to its own JSON file, named after a random id so renaming a
// workspace never touches the file. state.json remembers which workspace was open.
//
// The renderer owns the live state and sends a copy on every change. Main keeps the latest copy
// here, which is also where message routing reads the links from, and writes it to disk once the
// changes settle: a single drag produces dozens of updates per second.
const VERSION = 1
const SAVE_DELAY = 1000

export const workspaces = new Map()
const timers = new Map()
// Last JSON written for each workspace, to skip writes that wouldn't change the file.
const written = new Map()
let activeId = null

export function registerWorkspaces(win) {
  ipcMain.handle('workspace:load', () => {
    if (!activeId) activeId = open(readJson(statePath())?.active) ?? create()
    return { id: activeId, ...workspaces.get(activeId) }
  })

  ipcMain.on('workspace:update', (_ev, id, layout) => {
    if (!workspaces.has(id)) return
    workspaces.set(id, { ...workspaces.get(id), ...layout })
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => save(id), SAVE_DELAY)
    )
  })

  // Saves right away instead of waiting for the timer, while the shells are still alive to
  // report their directory (pty.js kills them on 'closed', which comes after this).
  win.on('close', () => {
    for (const id of workspaces.keys()) save(id)
  })

  win.on('closed', () => {
    ipcMain.removeHandler('workspace:load')
    ipcMain.removeAllListeners('workspace:update')
  })
}

function open(id) {
  if (!id) return null
  if (workspaces.has(id)) return id
  try {
    const json = readFileSync(workspacePath(id), 'utf8')
    const { version, name, camera, nodes, links } = JSON.parse(json)
    if (version !== VERSION) throw new Error(`unsupported version ${version}`)
    if (!Array.isArray(nodes) || !Array.isArray(links)) throw new Error('malformed file')
    workspaces.set(id, { name, camera, nodes, links })
    written.set(id, json)
    return id
  } catch (error) {
    // The file is left as it is: a new workspace gets a new file, so nothing is overwritten.
    console.error(`anbu: could not open workspace ${id}: ${error.message}`)
    return null
  }
}

function create() {
  const id = randomUUID()
  workspaces.set(id, { name: 'default', camera: { x: 0, y: 0, z: 1 }, nodes: [], links: [] })
  save(id)
  try {
    writeAtomic(statePath(), JSON.stringify({ open: [id], active: id }, null, 2))
  } catch (error) {
    console.error(`anbu: could not save state: ${error.message}`)
  }
  return id
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
      nodes: nodes.map((node) => ({ ...node, cwd: currentCwd(id, node.id) ?? node.cwd })),
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

function workspacePath(id) {
  return join(app.getPath('userData'), 'workspaces', `${id}.json`)
}
