import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setUpDataFolder } from './dataFolder'
import { registerFolders } from './folders'
import { registerGit } from './git'
import { registerHud } from './hud'
import { registerImageScheme, registerImages } from './images'
import { registerPets } from './pets'
import { registerMessages } from './messages'
import { registerPty, terminalsExited } from './pty'
import { registerRoles } from './roles'
import { registerStatus } from './status'
import { registerTelemetry } from './telemetry'
import { registerVoice } from './voice'
import { loadTheme, registerTheme, windowBackground } from './theme'
import { registerWorkspaces, workspaces } from './workspaces'

setUpDataFolder()
registerImageScheme()

// Under Wayland, global shortcuts (the HUD's) go through the desktop portal, which Chromium only
// uses when asked. It has to be asked before the app is ready.
if (process.platform === 'linux')
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    // The renderer's --bg, so the window doesn't flash another color before it paints.
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  registerTheme(mainWindow)
  registerWorkspaces(mainWindow)
  registerFolders(mainWindow)
  registerGit(mainWindow)
  registerImages(mainWindow)
  registerRoles(mainWindow)
  registerPets(mainWindow)
  registerHud(mainWindow)
  registerVoice(mainWindow)
  // The pet's bubble names the agent and where it is.
  registerStatus(mainWindow, (workspaceId, nodeId) => {
    const workspace = workspaces.get(workspaceId)
    const node = workspace?.nodes.find((n) => n.id === nodeId)
    return { title: node?.title, workspace: workspace?.name }
  })
  registerTelemetry(mainWindow)
  registerPty(mainWindow, registerMessages(mainWindow))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // In dev electron-vite serves the renderer with HMR; in production it loads the built html.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.vitor.nara')

  // F12 opens DevTools in dev; Ctrl+R is ignored in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  loadTheme()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Closing the window kills the terminals, but Electron hangs if it quits while one of them is
// still running. The first quit waits for them to exit; the second one goes through.
let terminalsDone = false
app.on('will-quit', (event) => {
  if (terminalsDone) return
  event.preventDefault()
  terminalsExited().then(() => {
    terminalsDone = true
    app.quit()
  })
})
