import { app, ipcMain, nativeTheme, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// The theme the user picked: 'light', 'dark' or 'system'. It goes to nativeTheme.themeSource,
// which is what the renderer's prefers-color-scheme follows, so the CSS needs nothing else. The
// choice is kept in theme.json in the data folder; without one the app opens in the dark theme,
// the one Nara is designed in first.
type Source = typeof nativeTheme.themeSource
const SOURCES: Source[] = ['light', 'dark', 'system']
const DEFAULT: Source = 'dark'

// The renderer's --bg in each theme, for the window to paint before the page does.
const BACKGROUNDS = { light: '#f6f6f7', dark: '#141416' }

// Must run once the app is ready and before the window opens, so it opens in the right colors.
export function loadTheme(): void {
  let saved: Source | null = null
  try {
    saved = JSON.parse(readFileSync(themePath(), 'utf8')).theme
  } catch {
    // No file yet, or a broken one: the default applies.
  }
  nativeTheme.themeSource = saved && SOURCES.includes(saved) ? saved : DEFAULT
}

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUNDS.dark : BACKGROUNDS.light
}

export function registerTheme(win: BrowserWindow): void {
  ipcMain.handle('theme:get', () => nativeTheme.themeSource)
  ipcMain.on('theme:set', (_event, source: Source) => {
    if (!SOURCES.includes(source)) return
    nativeTheme.themeSource = source
    try {
      writeFileSync(themePath(), JSON.stringify({ theme: source }, null, 2))
    } catch (error) {
      console.error(`nara: could not save the theme: ${(error as Error).message}`)
    }
  })

  // Also fires when the system switches while following it.
  const onUpdated = (): void => win.setBackgroundColor(windowBackground())
  nativeTheme.on('updated', onUpdated)

  win.on('closed', () => {
    ipcMain.removeHandler('theme:get')
    ipcMain.removeAllListeners('theme:set')
    nativeTheme.off('updated', onUpdated)
  })
}

function themePath(): string {
  return join(app.getPath('userData'), 'theme.json')
}
