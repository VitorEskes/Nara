import { app, ipcMain, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

// Nara updates itself from its GitHub releases (electron-builder.yml's publish), where the release
// workflow puts the latest*.yml files the updater reads. It downloads a new version in the
// background and the renderer offers to restart into it; quitting installs it too.
//
// Only where an update installs without a signing certificate: the AppImage (the new file takes
// the old one's place), the .deb (dpkg, through pkexec) and the Windows installer. macOS only
// installs updates signed with an Apple Developer ID, which Nara doesn't have yet, so there it
// stays as it is, like a run from source.

// The first check waits for the app to settle; then one every few hours.
const FIRST_CHECK = 10_000
const CHECK_EVERY = 4 * 60 * 60 * 1000

export function registerUpdates(win: BrowserWindow): void {
  let current: UpdateState = { state: supported() ? 'idle' : 'unsupported' }
  const set = (next: UpdateState): void => {
    current = next
    if (!win.isDestroyed()) win.webContents.send('update:state', current)
  }

  ipcMain.handle('update:get', () => current)
  ipcMain.handle('update:check', () => check())
  ipcMain.on('update:install', install)

  win.on('closed', () => {
    ipcMain.removeHandler('update:get')
    ipcMain.removeHandler('update:check')
    ipcMain.removeAllListeners('update:install')
  })
  if (current.state === 'unsupported') return

  const deb = !process.env.APPIMAGE && process.platform === 'linux'
  autoUpdater.autoDownload = true
  // A .deb asks for the password to install: not on its way out, only when asked to restart.
  autoUpdater.autoInstallOnAppQuit = !deb
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    if (current.state !== 'downloading' && current.state !== 'ready') set({ state: 'checking' })
  })
  autoUpdater.on('update-not-available', () => set({ state: 'latest' }))
  autoUpdater.on('update-available', ({ version }) =>
    set({ state: 'downloading', version, percent: 0 })
  )
  autoUpdater.on('download-progress', ({ percent }) => {
    if (current.state === 'downloading') set({ ...current, percent: Math.round(percent) })
  })
  autoUpdater.on('update-downloaded', ({ version }) => set({ state: 'ready', version }))
  autoUpdater.on('error', (error) => {
    // A failed check (offline) leaves a downloaded update ready.
    if (current.state !== 'ready') set({ state: 'error', message: error?.message ?? String(error) })
  })
  // The AppImage's new version is a file of its own, named after it, beside where the old one was.
  let appImage = process.env.APPIMAGE
  autoUpdater.on('appimage-filename-updated', (path: string) => (appImage = path))

  async function check(): Promise<UpdateState> {
    if (current.state === 'unsupported' || current.state === 'ready') return current
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      set({ state: 'error', message: (error as Error).message })
    }
    return current
  }

  // Restarts into the downloaded version. The AppImage replaces its file, and Nara starts the new
  // one once this one is gone: the updater would start it right away, while this one still holds
  // the single-instance lock. The others install on the way out and start again on their own.
  function install(): void {
    if (current.state !== 'ready') return
    if (process.env.APPIMAGE) {
      autoUpdater.quitAndInstall(true, false)
      app.relaunch({ execPath: appImage, args: [] })
    } else autoUpdater.quitAndInstall(true, true)
  }

  const first = setTimeout(check, FIRST_CHECK)
  const every = setInterval(check, CHECK_EVERY)
  win.on('closed', () => {
    clearTimeout(first)
    clearInterval(every)
  })
}

// Whether this build can update itself (see above).
function supported(): boolean {
  if (!app.isPackaged) return false
  if (process.platform === 'win32') return true
  if (process.platform !== 'linux') return false
  // electron-builder leaves this file in a .deb's resources, and the updater reads it.
  return Boolean(process.env.APPIMAGE) || existsSync(join(process.resourcesPath, 'package-type'))
}
