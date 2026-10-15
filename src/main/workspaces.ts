import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { basename, join } from 'path'
import { readJson, writeAtomic } from './files'
import { pickFolder } from './folders'
import { currentCwd } from './pty'
import type {
  CanvasNode,
  NewWorkspace,
  NodeId,
  NodeType,
  Project,
  Session,
  Shape,
  Workspace,
  WorkspaceLayout,
  WorkspaceSummary
} from '../shared/types'

// On disk a freehand stroke's points are a string (packShape below).
type StoredShape = Omit<Shape, 'points'> & { points?: string | [number, number][] }
// A stroke from before the whiteboard.
interface OldStroke {
  id: number
  points: string
  width: number
}

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

export const workspaces = new Map<string, Workspace>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
// Last JSON written for each workspace, to skip writes that wouldn't change the file.
const written = new Map<string, string>()

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

export function registerWorkspaces(win: BrowserWindow): void {
  const projects = new Map<string, Project>(
    ((readJson(projectsPath())?.projects ?? []) as Project[]).map((p) => [p.id, p])
  )

  // The workspaces open in the last run, minus any whose file is gone or unreadable. None open is
  // fine: the renderer asks for a project or a workspace.
  ipcMain.handle('workspace:session', () => {
    const saved: Partial<Session> = readJson(statePath()) ?? {}
    const open = (saved.open ?? []).filter(load)
    const session: Session = {
      open,
      active: saved.active && open.includes(saved.active) ? saved.active : (open[0] ?? null)
    }
    saveSession(session)
    return session
  })

  ipcMain.on('workspace:save-session', (_ev, session: Session) => saveSession(session))

  ipcMain.handle('workspace:list', () => list())
  ipcMain.handle('workspace:load', (_ev, id: string) => (load(id) ? workspaces.get(id) : null))

  // A new workspace starts by asking for its folder, which in a project defaults to the
  // project's. Returns null if the picker is canceled.
  ipcMain.handle('workspace:create', async (_ev, projectId?: string) => {
    const project = projectId ? projects.get(projectId) : undefined
    const folder = await pickFolder(win, {
      title: project ? `New workspace in ${project.name}` : 'New workspace',
      defaultPath: project?.folder
    })
    if (!folder) return null
    return project ? create({ project: project.id, folder }) : create({ folder })
  })

  // For a workspace from before folders existed, the first agent opened in it picks one.
  ipcMain.handle('workspace:pick-folder', async (_ev, id: string) => {
    const workspace = workspaces.get(id)
    if (!workspace) return null
    const folder = await pickFolder(win, { title: `Folder for ${workspace.name}` })
    if (folder) change(id, { folder })
    return folder
  })

  ipcMain.on('workspace:update', (_ev, id: string, layout: WorkspaceLayout) => change(id, layout))
  ipcMain.on('workspace:rename', (_ev, id: string, name: string) => change(id, { name }))

  // The renderer calls this before unmounting the workspace, while its shells are still alive
  // to report their directory.
  ipcMain.handle('workspace:close', (_ev, id: string) => {
    if (!workspaces.has(id)) return
    save(id)
    workspaces.delete(id)
    written.delete(id)
  })

  // Only closed workspaces can be deleted, so this never takes running terminals with it. The
  // renderer has asked the user first.
  ipcMain.handle('workspace:remove', async (_ev, id: string) => {
    const name = !workspaces.has(id) && read(id)?.workspace.name
    if (!name) return false
    rmSync(workspacePath(id), { force: true })
    return true
  })

  ipcMain.handle('project:list', () => sortByName([...projects.values()]))

  // A new project asks for its folder, is named after it and opens with one workspace there.
  ipcMain.handle('project:create', async () => {
    const folder = await pickFolder(win, { title: 'New project' })
    if (!folder) return null
    const taken = new Set([...projects.values()].map(({ name }) => name))
    const project: Project = {
      id: randomUUID(),
      name: uniqueName(basename(folder) || folder, taken),
      folder
    }
    projects.set(project.id, project)
    saveProjects(projects)
    return { project, workspace: create({ project: project.id, folder }) }
  })

  ipcMain.on('project:rename', (_ev, id: string, name: string) => {
    const project = projects.get(id)
    if (!project) return
    projects.set(id, { ...project, name })
    saveProjects(projects)
  })

  // Deleting a project deletes its workspaces too, so like a workspace it has to be closed first:
  // none of them can be open. The renderer has asked the user first.
  ipcMain.handle('project:remove', async (_ev, id: string) => {
    const project = projects.get(id)
    if (!project) return false
    const members = list().filter((w) => w.project === id)
    if (members.some((w) => workspaces.has(w.id))) return false
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

// Every saved workspace, open or not, as { id, name, project, folder, terminals, notes, preview }
// (terminals and notes are how many of each it has; preview is the boxes and links the overview
// draws a miniature of the canvas from), sorted by name.
function list(): WorkspaceSummary[] {
  let files: string[]
  try {
    files = readdirSync(join(app.getPath('userData'), 'workspaces'))
  } catch {
    return []
  }
  const all = files
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .flatMap((id): WorkspaceSummary[] => {
      const {
        name,
        project,
        folder,
        nodes = [],
        links = []
      }: Partial<Workspace> = workspaces.get(id) ?? read(id)?.workspace ?? {}
      if (!name) return []
      const count = (type: NodeType): number => nodes.filter((node) => node.type === type).length
      const summary: WorkspaceSummary = {
        id,
        name,
        project,
        folder,
        terminals: count('terminal'),
        notes: count('note'),
        updated: modified(id),
        preview: {
          nodes: nodes.map(({ id, type, x, y, w, h, style }) => ({
            id,
            type,
            x,
            y,
            w,
            h,
            paper: style?.paper
          })),
          links: links.map(({ from, to }) => ({ from, to }))
        }
      }
      return [summary]
    })
  return sortByName(all)
}

// Brings a workspace into memory. Returns false if its file can't be used.
function load(id: string): boolean {
  if (workspaces.has(id)) return true
  const file = read(id)
  if (!file) return false
  workspaces.set(id, file.workspace)
  written.set(id, file.json)
  return true
}

// A missing, broken or newer-version file reads as null and is left as it is: new workspaces get
// new files, so nothing is ever overwritten.
function read(id: string): { json: string; workspace: Workspace } | null {
  try {
    const json = readFileSync(workspacePath(id), 'utf8')
    const {
      version,
      name,
      project,
      folder,
      camera,
      nodes,
      links,
      shapes,
      strokes = [],
      code,
      review
    } = JSON.parse(json) as Omit<Workspace, 'shapes'> & {
      version: number
      shapes?: StoredShape[]
      strokes?: OldStroke[]
    }
    if (version !== VERSION) throw new Error(`unsupported version ${version}`)
    if (![nodes, links, shapes ?? strokes].every(Array.isArray)) throw new Error('malformed file')
    // Files saved before notes existed have no type: back then every node was a terminal.
    const typed = nodes.map((node: Omit<CanvasNode, 'type'> & { type?: NodeType }): CanvasNode => ({
      type: 'terminal',
      ...node
    }))
    // Files from before the whiteboard have freehand strokes instead, which become its first
    // shapes; older ones have neither.
    const drawn = shapes
      ? shapes.filter((shape) => shape?.type).map(unpackShape)
      : strokes.filter((stroke) => typeof stroke.points === 'string').map(strokeToShape)
    return {
      json,
      workspace: {
        name,
        project,
        folder,
        camera,
        nodes: typed,
        links,
        shapes: drawn,
        code,
        review
      }
    }
  } catch (error) {
    console.error(`nara: could not read workspace ${id}: ${(error as Error).message}`)
    return null
  }
}

// A workspace in a project is named "workspace 1", "workspace 2"...; a loose one after its folder.
function create({ project, folder }: { project?: string; folder: string }): NewWorkspace {
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
    shapes: []
  })
  save(id)
  return { id, ...workspace }
}

// `first` if it's free, otherwise "<base> 2", "<base> 3"... up to the first one free.
function uniqueName(base: string, taken: Set<string>, first = base): string {
  if (!taken.has(first)) return first
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

// Changes a node in main's copy, for edits that don't start in the renderer (an agent writing to
// a note). The copy has to change right away: two agents appending to the same note build on
// what's here, and waiting for the renderer to echo the first write would lose it.
export function updateNode(id: string, nodeId: NodeId, changes: Partial<CanvasNode>): void {
  const workspace = workspaces.get(id)
  if (!workspace) return
  const nodes = workspace.nodes.map((node) => (node.id === nodeId ? { ...node, ...changes } : node))
  change(id, { nodes })
}

function change(id: string, patch: Partial<Workspace>): void {
  const workspace = workspaces.get(id)
  if (!workspace) return
  workspaces.set(id, { ...workspace, ...patch })
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => save(id), SAVE_DELAY)
  )
}

function save(id: string): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const workspace = workspaces.get(id)
  if (!workspace) return

  const { name, project, folder, camera, nodes, links, shapes = [], code, review } = workspace
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
      shapes: shapes.map(packShape),
      // The code view: whether it's showing, the folder its explorer is on, the open files.
      code,
      // The review view: what's been viewed and the comments not sent yet, by repository.
      review
    },
    null,
    2
  )
  if (json === written.get(id)) return

  try {
    writeAtomic(workspacePath(id), json)
    written.set(id, json)
  } catch (error) {
    console.error(`nara: could not save workspace ${id}: ${(error as Error).message}`)
  }
}

// On disk a freehand stroke's points are one "x,y x,y ..." string, the format of SVG's `points`:
// as arrays, the indented JSON would spend four lines on every point.
function packShape(shape: Shape): StoredShape {
  if (!Array.isArray(shape.points)) return shape
  return { ...shape, points: shape.points.map((point) => point.join(',')).join(' ') }
}

function unpackShape(shape: StoredShape): Shape {
  if (typeof shape.points !== 'string') return shape as Shape
  return { ...shape, points: unpackPoints(shape.points) }
}

function unpackPoints(points: string): [number, number][] {
  return points
    .split(' ')
    .filter(Boolean)
    .map((point) => point.split(',').map(Number) as [number, number])
}

// A stroke from before the whiteboard (absolute points and a width) as a freehand shape: its box,
// and its points relative to the box's corner.
function strokeToShape(stroke: OldStroke): Shape {
  const points = unpackPoints(stroke.points)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    id: stroke.id,
    type: 'draw',
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y),
    angle: 0,
    style: { stroke: 'ink', width: stroke.width > 3.5 ? 'l' : 'm' },
    points: points.map(([px, py]): [number, number] => [
      Math.round((px - x) * 10) / 10,
      Math.round((py - y) * 10) / 10
    ])
  }
}

function saveSession({ open, active }: Session): void {
  try {
    writeAtomic(statePath(), JSON.stringify({ open, active }, null, 2))
  } catch (error) {
    console.error(`nara: could not save state: ${(error as Error).message}`)
  }
}

function saveProjects(projects: Map<string, Project>): void {
  const json = JSON.stringify({ version: VERSION, projects: [...projects.values()] }, null, 2)
  try {
    writeAtomic(projectsPath(), json)
  } catch (error) {
    console.error(`nara: could not save projects: ${(error as Error).message}`)
  }
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

function projectsPath(): string {
  return join(app.getPath('userData'), 'projects.json')
}

// Ids come from the renderer; checking them keeps a bad one from reaching outside the folder.
// When the workspace's file was last written, in ms, or null if it can't be read.
function modified(id: string): number | null {
  try {
    return statSync(workspacePath(id)).mtimeMs
  } catch {
    return null
  }
}

function workspacePath(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new Error(`invalid workspace id: ${id}`)
  return join(app.getPath('userData'), 'workspaces', `${id}.json`)
}
