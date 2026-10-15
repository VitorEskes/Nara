import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { connect } from 'net'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readJson, writeAtomic } from './files'
import { registerPets } from './pets'
import type { AgentReply, AgentStatus, NodeId, PetConfig } from '../shared/types'

// The desktop pet's own process (pet.js starts it with --nara-pet): one small window, transparent
// and over every other, with the pet in its bottom right corner and room above and to its left
// for its bubble and its command center. Only what's drawn takes the pointer: the window's shape
// follows the pet, the bubble and the panel (the renderer reports them), and the rest of it lets
// clicks through to whatever is under it. Dragging the pet moves the window.
//
// It has none of the app's state: the statuses and the settings come over the socket in
// NARA_PET_SOCK, and the answers and jumps go back the same way.
const SIZE = { width: 380, height: 540 }
// Room left between the window and the edge of the screen at first.
const MARGIN = 8
// How often the window follows the pointer while the pet is dragged, in ms.
const DRAG_EVERY = 16

export function runPetProcess(): void {
  // Its own browser session: the app's is in use by the app's process.
  app.setPath('sessionData', join(app.getPath('userData'), 'pet-window'))
  app.whenReady().then(start)
  app.on('window-all-closed', () => app.quit())
}

function start(): void {
  const place = join(app.getPath('userData'), 'pet-window.json')
  const saved = readJson(place)
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    ...SIZE,
    x: Number.isFinite(saved?.x) ? saved.x : workArea.x + workArea.width - SIZE.width - MARGIN,
    y: Number.isFinite(saved?.y) ? saved.y : workArea.y + workArea.height - SIZE.height - MARGIN,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Nara pet',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => win.showInactive())
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#pet`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'pet' })
  }
  registerPets(win)

  // The app, over the socket.
  let statuses: AgentStatus[] = []
  let prefs: PetConfig = { pet: null, size: 'm' }
  let asked = 0
  const answers = new Map<number, (ok: boolean) => void>()
  const link = connect(process.env.NARA_PET_SOCK ?? '')
  let buffer = ''
  link.setEncoding('utf8')
  link.on('data', (chunk) => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      let data
      try {
        data = JSON.parse(line)
      } catch {
        continue
      }
      if (data.type === 'status') {
        statuses = data.statuses
        if (!win.isDestroyed()) win.webContents.send('agents:status', statuses)
      } else if (data.type === 'prefs') {
        prefs = { pet: data.pet, size: data.size }
        if (!win.isDestroyed()) win.webContents.send('pet:prefs', prefs)
      } else if (data.type === 'replied') {
        answers.get(data.id)?.(data.ok)
        answers.delete(data.id)
      }
    }
  })
  // Without the app there's nothing to show: the pet goes with it.
  link.on('close', () => app.quit())
  link.on('error', () => app.quit())
  const tell = (data: object): void => {
    if (!link.destroyed) link.write(`${JSON.stringify(data)}\n`)
  }

  ipcMain.handle('agents:status', () => statuses)
  ipcMain.handle('pet:prefs', () => prefs)
  ipcMain.on('agents:seen', (_ev, workspaceId: string, nodeId: NodeId) =>
    tell({ type: 'seen', workspaceId, nodeId })
  )
  ipcMain.handle(
    'agents:reply',
    (_ev, workspaceId: string, nodeId: NodeId, reply: AgentReply) =>
      new Promise<boolean>((resolve) => {
        const id = ++asked
        answers.set(id, resolve)
        tell({ type: 'reply', id, workspaceId, nodeId, reply })
        setTimeout(() => answers.has(id) && (answers.delete(id), resolve(false)), 5000)
      })
  )
  ipcMain.on('pet:jump', (_ev, status: AgentStatus) => tell({ type: 'jump', status }))

  // Where the window takes the pointer: the rectangles the renderer draws in, in its pixels. Each
  // edge is rounded outward on its own, so a part that sits between pixels keeps its last row and
  // column (rounding the start down and the size up loses them).
  ipcMain.on('pet:shape', (_ev, rects: Electron.Rectangle[]) => {
    if (!Array.isArray(rects) || win.isDestroyed()) return
    win.setShape(
      rects.map(({ x, y, width, height }) => {
        const left = Math.max(0, Math.floor(x))
        const top = Math.max(0, Math.floor(y))
        return {
          x: left,
          y: top,
          width: Math.ceil(x + width) - left,
          height: Math.ceil(y + height) - top
        }
      })
    )
  })

  // Dragging: the window follows the pointer, kept where the press was on it, until let go.
  let drag: ReturnType<typeof setInterval> | undefined
  ipcMain.on('pet:drag-start', () => {
    if (drag || win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const [x, y] = win.getPosition()
    const offset = { x: cursor.x - x, y: cursor.y - y }
    drag = setInterval(() => {
      const point = screen.getCursorScreenPoint()
      win.setPosition(point.x - offset.x, point.y - offset.y)
    }, DRAG_EVERY)
  })
  ipcMain.on('pet:drag-end', () => {
    clearInterval(drag)
    drag = undefined
    if (win.isDestroyed()) return
    const [x, y] = win.getPosition()
    writeAtomic(place, JSON.stringify({ x, y }))
  })
}
