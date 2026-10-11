import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setUpDataFolder } from './dataFolder'
import { registerFolders } from './folders'
import { registerMessages } from './messages'
import { registerPty, terminalsExited } from './pty'
import { registerRoles } from './roles'
import { loadTheme, registerTheme, windowBackground } from './theme'
import { registerWorkspaces } from './workspaces'

setUpDataFolder()

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
  registerRoles(mainWindow)
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
