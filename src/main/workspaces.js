import { app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { currentCwd } from './pty'

// Each workspace is a canvas saved to its own JSON file, named after a random id so renaming a
// workspace never touches the file. state.json remembers which workspaces were open and which one
// was active.
//
// A workspace has the folder its terminals and agents open in, and may belong to a project. A
// project is a name and a default folder for the workspaces created in it; the projects are all
// in projects.json. A workspace without a project is a loose one, as every workspace was before
// projects existed (those also have no folder until an agent asks for one).
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
// Where the folder picker opens when there's no better default: the last folder picked.
let lastFolder = process.env.HOME

const HANDLERS = [
  'workspace:session',
  'workspace:list',
  'workspace:load',
  'workspace:create',
  'workspace:pick-folder',
  'workspace:close',
  'workspace:remove',
  'project:list',
  'project:create',
  'project:remove'
]
const LISTENERS = [
  'workspace:save-session',
  'workspace:update',
  'workspace:rename',
  'project:rename'
]

export function registerWorkspaces(win) {
  const projects = new Map((readJson(projectsPath())?.projects ?? []).map((p) => [p.id, p]))

  // The workspaces open in the last run, minus any whose file is gone or unreadable. None open is
  // fine: the renderer asks for a project or a workspace.
  ipcMain.handle('workspace:session', () => {
    const saved = readJson(statePath()) ?? {}
    const open = (saved.open ?? []).filter(load)
    const session = { open, active: open.includes(saved.active) ? saved.active : (open[0] ?? null) }
    saveSession(session)
    return session
  })

  ipcMain.on('workspace:save-session', (_ev, session) => saveSession(session))

  ipcMain.handle('workspace:list', () => list())
  ipcMain.handle('workspace:load', (_ev, id) => (load(id) ? workspaces.get(id) : null))

  // A new workspace starts by asking for its folder, which in a project defaults to the
  // project's. Returns null if the picker is canceled.
  ipcMain.handle('workspace:create', async (_ev, projectId) => {
    const project = projects.get(projectId)
    const folder = await pickFolder(win, {
      title: project ? `New workspace in ${project.name}` : 'New workspace',
      defaultPath: project?.folder
    })
    if (!folder) return null
    return project ? create({ project: project.id, folder }) : create({ folder })
  })

  // For a workspace from before folders existed, the first agent opened in it picks one.
  ipcMain.handle('workspace:pick-folder', async (_ev, id) => {
    if (!workspaces.has(id)) return null
    const folder = await pickFolder(win, { title: `Folder for ${workspaces.get(id).name}` })
    if (folder) change(id, { folder })
    return folder
  })

  ipcMain.on('workspace:update', (_ev, id, layout) => change(id, layout))
  ipcMain.on('workspace:rename', (_ev, id, name) => change(id, { name }))

  // The renderer calls this before unmounting the workspace, while its shells are still alive
  // to report their directory.
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
    const confirmed = await confirm(win, {
      message: `Delete workspace "${name}"?`,
      detail: 'Its terminals, positions and links will be gone for good.'
    })
    if (confirmed) rmSync(workspacePath(id), { force: true })
    return confirmed
  })

  ipcMain.handle('project:list', () => sortByName([...projects.values()]))

  // A new project asks for its folder, is named after it and opens with one workspace there.
  ipcMain.handle('project:create', async () => {
    const folder = await pickFolder(win, { title: 'New project' })
    if (!folder) return null
    const taken = new Set([...projects.values()].map(({ name }) => name))
    const project = {
      id: randomUUID(),
      name: uniqueName(basename(folder) || folder, taken),
      folder
    }
    projects.set(project.id, project)
    saveProjects(projects)
    return { project, workspace: create({ project: project.id, folder }) }
  })

  ipcMain.on('project:rename', (_ev, id, name) => {
    if (!projects.has(id)) return
    projects.set(id, { ...projects.get(id), name })
    saveProjects(projects)
  })

  // Deleting a project deletes its workspaces too, so like a workspace it has to be closed first:
  // none of them can be open.
  ipcMain.handle('project:remove', async (_ev, id) => {
    const project = projects.get(id)
    if (!project) return false
    const members = list().filter((w) => w.project === id)
    if (members.some((w) => workspaces.has(w.id))) return false
    const count = members.length === 1 ? '1 workspace' : `${members.length} workspaces`
    const confirmed = await confirm(win, {
      message: `Delete project "${project.name}"?`,
      detail: `Its ${count} will be deleted with it. The folder ${project.folder} is not touched.`
    })
    if (!confirmed) return false
    for (const w of members) rmSync(workspacePath(w.id), { force: true })
    projects.delete(id)
    saveProjects(projects)
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
    for (const name of HANDLERS) ipcMain.removeHandler(name)
    for (const name of LISTENERS) ipcMain.removeAllListeners(name)
  })
}

async function pickFolder(win, { title, defaultPath = lastFolder }) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title,
    defaultPath,
    buttonLabel: 'Open here',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths[0]) return null
  lastFolder = filePaths[0]
  return lastFolder
}

async function confirm(win, { message, detail }) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message,
    detail,
    buttons: ['Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  })
  return response === 0
}

// Every saved workspace, open or not, as { id, name, project, folder }, sorted by name.
function list() {
  let files
  try {
    files = readdirSync(join(app.getPath('userData'), 'workspaces'))
  } catch {
    return []
  }
  const all = files
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .map((id) => {
      const { name, project, folder } = workspaces.get(id) ?? read(id)?.workspace ?? {}
      return { id, name, project, folder }
    })
    .filter(({ name }) => name)
  return sortByName(all)
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
    const { version, name, project, folder, camera, nodes, links, strokes = [] } = JSON.parse(json)
    if (version !== VERSION) throw new Error(`unsupported version ${version}`)
    if (![nodes, links, strokes].every(Array.isArray)) throw new Error('malformed file')
    // Files saved before notes existed have no type: back then every node was a terminal.
    const typed = nodes.map((node) => ({ type: 'terminal', ...node }))
    // Older files have no strokes at all, which the default above covers.
    const drawn = strokes.filter((stroke) => typeof stroke.points === 'string').map(unpackStroke)
    return {
      json,
      workspace: { name, project, folder, camera, nodes: typed, links, strokes: drawn }
    }
  } catch (error) {
    console.error(`anbu: could not read workspace ${id}: ${error.message}`)
    return null
  }
}

// A workspace in a project is named "workspace 1", "workspace 2"...; a loose one after its folder.
function create({ project, folder }) {
  const id = randomUUID()
  const taken = new Set(
    list()
      .filter((w) => w.project === project)
      .map(({ name }) => name)
  )
  const name = project
    ? uniqueName('workspace', taken, 'workspace 1')
    : uniqueName(basename(folder) || folder, taken)
  const workspace = { name, project, folder }
  workspaces.set(id, {
    ...workspace,
    camera: { x: 0, y: 0, z: 1 },
    nodes: [],
    links: [],
    strokes: []
  })
  save(id)
  return { id, ...workspace }
}

// `first` if it's free, otherwise "<base> 2", "<base> 3"... up to the first one free.
function uniqueName(base, taken, first = base) {
  if (!taken.has(first)) return first
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

// Changes a node in main's copy, for edits that don't start in the renderer (an agent writing to
// a note). The copy has to change right away: two agents appending to the same note build on
// what's here, and waiting for the renderer to echo the first write would lose it.
export function updateNode(id, nodeId, changes) {
  const workspace = workspaces.get(id)
  if (!workspace) return
  const nodes = workspace.nodes.map((node) => (node.id === nodeId ? { ...node, ...changes } : node))
  change(id, { nodes })
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

  const { name, project, folder, camera, nodes, links, strokes } = workspaces.get(id)
  const json = JSON.stringify(
    {
      version: VERSION,
      name,
      project,
      folder,
      camera,
      // The renderer doesn't know where each shell has cd'd to since it started; the OS does.
      nodes: nodes.map((node) =>
        node.type === 'terminal' ? { ...node, cwd: currentCwd(id, node.id) ?? node.cwd } : node
      ),
      links,
      strokes: strokes.map(packStroke)
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

// On disk a stroke's points are one "x,y x,y ..." string, the format of SVG's `points`: as
// arrays, the indented JSON would spend four lines on every point.
function packStroke(stroke) {
  return { ...stroke, points: stroke.points.map((point) => point.join(',')).join(' ') }
}

function unpackStroke(stroke) {
  return {
    ...stroke,
    points: stroke.points.split(' ').map((point) => point.split(',').map(Number))
  }
}

function saveSession({ open, active }) {
  try {
    writeAtomic(statePath(), JSON.stringify({ open, active }, null, 2))
  } catch (error) {
    console.error(`anbu: could not save state: ${error.message}`)
  }
}

function saveProjects(projects) {
  const json = JSON.stringify({ version: VERSION, projects: [...projects.values()] }, null, 2)
  try {
    writeAtomic(projectsPath(), json)
  } catch (error) {
    console.error(`anbu: could not save projects: ${error.message}`)
  }
}

function sortByName(items) {
  return items.sort((a, b) => a.name.localeCompare(b.name))
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

function projectsPath() {
  return join(app.getPath('userData'), 'projects.json')
}

// Ids come from the renderer; checking them keeps a bad one from reaching outside the folder.
function workspacePath(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`invalid workspace id: ${id}`)
  return join(app.getPath('userData'), 'workspaces', `${id}.json`)
}
