import { app, ipcMain, nativeTheme } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// The theme the user picked: 'light', 'dark' or 'system'. It goes to nativeTheme.themeSource,
// which is what the renderer's prefers-color-scheme follows, so the CSS needs nothing else. The
// choice is kept in theme.json in the data folder; without one the app opens in the dark theme,
// the one Nara is designed in first.
const SOURCES = ['light', 'dark', 'system']
const DEFAULT = 'dark'

// The renderer's --bg in each theme, for the window to paint before the page does.
const BACKGROUNDS = { light: '#f6f6f7', dark: '#141416' }

// Must run once the app is ready and before the window opens, so it opens in the right colors.
export function loadTheme() {
  let saved = null
  try {
    saved = JSON.parse(readFileSync(themePath(), 'utf8')).theme
  } catch {
    // No file yet, or a broken one: the default applies.
  }
  nativeTheme.themeSource = SOURCES.includes(saved) ? saved : DEFAULT
}

export function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? BACKGROUNDS.dark : BACKGROUNDS.light
}

export function registerTheme(win) {
  ipcMain.handle('theme:get', () => nativeTheme.themeSource)
  ipcMain.on('theme:set', (_event, source) => {
    if (!SOURCES.includes(source)) return
    nativeTheme.themeSource = source
    try {
      writeFileSync(themePath(), JSON.stringify({ theme: source }, null, 2))
    } catch (error) {
      console.error(`nara: could not save the theme: ${error.message}`)
    }
  })

  // Also fires when the system switches while following it.
  const onUpdated = () => win.setBackgroundColor(windowBackground())
  nativeTheme.on('updated', onUpdated)

  win.on('closed', () => {
    ipcMain.removeHandler('theme:get')
    ipcMain.removeAllListeners('theme:set')
    nativeTheme.off('updated', onUpdated)
  })
}

function themePath() {
  return join(app.getPath('userData'), 'theme.json')
}
