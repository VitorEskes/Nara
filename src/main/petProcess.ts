import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { connect } from 'net'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { readJson, writeAtomic } from './files'
import { registerPets } from './pets'
import { setWindowState } from './x11'
import type { AgentReply, AgentStatus, NodeId, PetConfig } from '../shared/types'

// The desktop pet's process (pet.ts starts it with --nara-pet): one small transparent window over
// every other, with the pet in its bottom right corner and room for its bubble and command center.
// The window's shape follows what the renderer draws, so clicks elsewhere go through to whatever is
// under it. macOS has no window shapes: there the window lets the pointer through until it's over
// the shape. It keeps none of the app's state: everything comes and goes over NARA_PET_SOCK.
const SIZE = { width: 380, height: 540 }
// Room left between the window and the edge of the screen at first.
const MARGIN = 8
// How often the window follows the pointer while the pet is dragged, in ms.
const DRAG_EVERY = 16
// How often macOS checks whether the pointer is over the shape, in ms.
const POINTER_EVERY = 50
// When the window manager is asked to keep the pet out of the taskbar after it shows, in ms: it
// only takes the request once the window is on screen, which takes a moment.
const SKIP_TASKBAR_AT = [300, 2000]

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
    // Its own process, so the taskbar and the window switcher would otherwise show Electron's icon.
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => {
    win.showInactive()
    if (process.platform === 'linux') {
      for (const delay of SKIP_TASKBAR_AT) setTimeout(() => keepOutOfTaskbar(win), delay)
    }
  })
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
  let shape: Electron.Rectangle[] = []
  ipcMain.on('pet:shape', (_ev, rects: Electron.Rectangle[]) => {
    if (!Array.isArray(rects) || win.isDestroyed()) return
    shape = rects.map(({ x, y, width, height }) => {
      const left = Math.max(0, Math.floor(x))
      const top = Math.max(0, Math.floor(y))
      return {
        x: left,
        y: top,
        width: Math.ceil(x + width) - left,
        height: Math.ceil(y + height) - top
      }
    })
    if (process.platform !== 'darwin') win.setShape(shape)
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

  if (process.platform === 'darwin') {
    passThroughOutside(
      win,
      () => shape,
      () => Boolean(drag)
    )
  }
}

// skipTaskbar doesn't reach the window manager under X11 (the pet's XWayland included): the pet
// would show in the taskbar and the window switcher as an app of its own. Asked directly, it
// leaves it out of both, and stops the taskbar flashing for it.
function keepOutOfTaskbar(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  setWindowState(win.getNativeWindowHandle().readUInt32LE(0), {
    add: [
      '_NET_WM_STATE_SKIP_TASKBAR',
      '_NET_WM_STATE_SKIP_PAGER',
      '_KDE_NET_WM_STATE_SKIP_SWITCHER'
    ],
    remove: ['_NET_WM_STATE_DEMANDS_ATTENTION']
  }).catch(() => {})
}

// On macOS the whole window would take the pointer, transparent parts and all, and the clicks
// meant for what's under them (a file on the desktop) would never get there. So the window ignores
// the mouse except while the pointer is over `shape` or the pet is being dragged. The pointer's
// moves still reach the page, so hovering works as before.
function passThroughOutside(
  win: BrowserWindow,
  shape: () => Electron.Rectangle[],
  dragging: () => boolean
): void {
  let through = true
  win.setIgnoreMouseEvents(true, { forward: true })
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer)
    const point = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    const x = point.x - bounds.x
    const y = point.y - bounds.y
    const over = shape().some(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
    )
    if (through === !(over || dragging())) return
    through = !through
    win.setIgnoreMouseEvents(through, { forward: true })
  }, POINTER_EVERY)
}
