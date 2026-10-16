import { BrowserWindow, app, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { AgentStatus } from '../shared/types'

// The floating HUD: a small window over every other app, with the pet and its command center,
// summoned from anywhere with a global shortcut. It loads the same renderer as the main window,
// which shows the HUD instead of the app when the page's hash is #hud.
//
// On Linux under Wayland the shortcut goes through the desktop portal (see index.js), and the
// compositor decides where the window opens and whether it stays on top.
const HUD_SHORTCUT = 'CommandOrControl+Alt+Space'
const SIZE = { width: 380, height: 540 }
// Room left between the HUD and the edge of the screen.
const MARGIN = 16

export function registerHud(main: BrowserWindow): void {
  let current: BrowserWindow | null = null
  let enabled = false

  function create(): BrowserWindow {
    const hud = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    hud.setAlwaysOnTop(true, 'floating')
    hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    hud.on('closed', () => (current = null))
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      hud.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#hud`)
    } else {
      hud.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'hud' })
    }
    return hud
  }

  // Opens in the top right corner of the screen the pointer is on.
  function show(): void {
    const hud = (current ??= create())
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    hud.setPosition(
      Math.round(workArea.x + workArea.width - SIZE.width - MARGIN),
      Math.round(workArea.y + MARGIN)
    )
    const reveal = (): void => {
      hud.show()
      hud.focus()
    }
    if (hud.webContents.isLoading()) hud.once('ready-to-show', reveal)
    else reveal()
  }

  function toggle(): void {
    if (current?.isVisible()) current.hide()
    else show()
  }

  // The renderer turns the shortcut on or off from the settings. Returns whether it's bound:
  // another app may hold it, or the desktop may not offer global shortcuts.
  ipcMain.handle('hud:enable', (_ev, on: boolean) => {
    if (on && !enabled) enabled = globalShortcut.register(HUD_SHORTCUT, toggle)
    else if (!on && enabled) {
      globalShortcut.unregister(HUD_SHORTCUT)
      enabled = false
    }
    return enabled
  })
  ipcMain.on('hud:toggle', toggle)
  ipcMain.on('hud:hide', () => current?.hide())

  // From the HUD to an agent: Nara comes to the front and its pet takes the user there.
  ipcMain.on('hud:jump', (_ev, status: AgentStatus) => {
    current?.hide()
    if (main.isDestroyed()) return
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
    main.webContents.send('agents:jump', status)
  })

  main.on('closed', () => {
    if (enabled) globalShortcut.unregister(HUD_SHORTCUT)
    enabled = false
    current?.destroy()
    for (const name of ['hud:toggle', 'hud:hide', 'hud:jump']) {
      ipcMain.removeAllListeners(name)
    }
    ipcMain.removeHandler('hud:enable')
  })
}

app.on('will-quit', () => globalShortcut.unregisterAll())
