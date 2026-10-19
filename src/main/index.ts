import { app, ipcMain, shell, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerBrowser } from './browser'
import { registerChanges } from './changes'
import { writeShellIntegration } from './shell'
import { registerCode } from './code'
import { registerReview } from './review'
import { setUpDataFolder } from './dataFolder'
import { registerFolders } from './folders'
import { registerGit } from './git'
import { registerHud } from './hud'
import { registerImageScheme, registerImages } from './images'
import { registerPets } from './pets'
import { PET_FLAG, registerDesktopPet } from './pet'
import { runPetProcess } from './petProcess'
import { registerMessages } from './messages'
import { registerPty, terminalsExited } from './pty'
import { registerRoles } from './roles'
import { registerServers } from './servers'
import { registerStatus } from './status'
import { registerTelemetry } from './telemetry'
import { registerUsage } from './usage'
import { loadTheme, registerTheme, windowBackground } from './theme'
import { registerUpdates } from './updates'
import { registerWorkspaces, workspaces } from './workspaces'

setUpDataFolder()

// The commands of `nara` (cli.ts), as the first argument.
const CLI_COMMANDS = new Set([
  'peers',
  'canvas',
  'send',
  'note',
  'browser',
  'run',
  'hook',
  'statusline',
  'model',
  'merge'
])

// The main window, for a second launch to bring forward.
let mainWindow: BrowserWindow | null = null

// The same program runs the desktop pet in a process of its own (pet.ts): that process shows the
// pet and nothing else.
const cli = cliArgs()
if (process.argv.includes(PET_FLAG)) runPetProcess()
else if (cli) runCli(cli)
else runApp()

// The arguments of a `nara` command that reached the app itself instead of resources/bin/nara. The
// AppImage puts its own folder on the PATH, and the app's executable there is called `nara` too:
// a terminal whose PATH lost Nara's folder (a hook's shell, an agent's) finds it first, and
// without this would open a whole new Nara. Only inside a Nara terminal, which has NARA_SOCK.
function cliArgs(): string[] | null {
  if (!process.env.NARA_SOCK) return null
  // The AppImage adds --no-sandbox where the system doesn't allow Chromium's sandbox.
  const args = process.argv.slice(app.isPackaged ? 1 : 2).filter((arg) => arg !== '--no-sandbox')
  return CLI_COMMANDS.has(args[0]) ? args : null
}

// Runs the command as resources/bin/nara would: cli.js with Electron acting as Node. This process
// only waits for it, and leaves the keys to it (`nara run` hands them on to the agent).
function runCli(args: string[]): void {
  app.disableHardwareAcceleration()
  const child = spawn(process.execPath, [join(__dirname, 'cli.js'), ...args], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  process.on('SIGINT', () => {})
  for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => child.kill(signal))
  }
  child.on('error', () => process.exit(1))
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 : 1)))
}

function runApp(): void {
  // One Nara at a time: a second one would fight the first over the sockets and the workspace
  // files. Launching it again brings the first one forward instead.
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  registerImageScheme()

  // Under Wayland, global shortcuts (the HUD's) go through the desktop portal, which Chromium only
  // uses when asked. It has to be asked before the app is ready.
  if (process.platform === 'linux')
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('dev.vitor.nara')

    // F12 opens DevTools in dev; Ctrl+R is ignored in production.
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    loadTheme()
    writeShellIntegration()
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
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
      sandbox: false,
      // The browser nodes (BrowserNode.tsx); main/browser.ts locks their pages down.
      webviewTag: true
    }
  })

  // Each module below cleans up when the window closes: more than Node's default of ten.
  mainWindow.setMaxListeners(30)
  registerTheme(mainWindow)
  registerWorkspaces(mainWindow)
  registerFolders(mainWindow)
  registerGit(mainWindow)
  registerChanges()
  registerBrowser(mainWindow, ipcMain)
  registerCode(mainWindow)
  registerReview(mainWindow)
  registerImages(mainWindow)
  registerRoles(mainWindow)
  registerPets(mainWindow)
  registerHud(mainWindow)
  registerDesktopPet(mainWindow)
  // The pet's bubble names the agent and where it is.
  registerStatus(mainWindow, (workspaceId: string, nodeId: number) => {
    const workspace = workspaces.get(workspaceId)
    const node = workspace?.nodes.find((n) => n.id === nodeId)
    return { title: node?.title, workspace: workspace?.name }
  })
  registerTelemetry(mainWindow)
  registerUsage(mainWindow)
  registerPty(mainWindow, registerMessages(mainWindow))
  registerUpdates(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // A node in full screen takes the whole screen (Workspace.tsx), and gives it back as it was: a
  // window already in full screen stays there. Leaving it another way (F11, the window manager)
  // brings the node back too.
  let fullBefore = false
  ipcMain.on('app:full-screen', (_ev, on: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (on) fullBefore = mainWindow.isFullScreen()
    if (on || !fullBefore) mainWindow.setFullScreen(on)
  })
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('app:full-screen', false))
  mainWindow.on('closed', () => ipcMain.removeAllListeners('app:full-screen'))

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
