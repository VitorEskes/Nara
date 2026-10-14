import { webContents } from 'electron'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { normalizeUrl } from '../shared/url'

// Browser nodes: a <webview> on the canvas (BrowserNode.jsx). Their pages are locked down like any
// website's, and each one tells main its webContents once it's ready, so an agent linked to it
// can drive and read it with `nara browser` (messages.js).

// The most of a page's text `nara browser read` prints.
const MAX_TEXT = 200 * 1024
// Only web pages: never a file of the user's, never anything that runs with more rights.
const SCHEMES = new Set(['http:', 'https:', 'about:'])

// The keys of the app's Ctrl+Shift shortcuts (renderer's shortcuts.js): the app's own, the code
// view's and the review's.
const APP_KEYS = new Set(['KeyN', 'KeyW', 'KeyO', 'KeyB', 'KeyL', 'KeyE', 'KeyG'])

// `${workspaceId}:${nodeId}` -> webContents id.
const pages = new Map()

export function registerBrowser(win, ipcMain) {
  // Whatever the renderer asks for, a page gets no Node, no preload and a sandbox.
  win.webContents.on('will-attach-webview', (event, preferences, params) => {
    delete preferences.preload
    preferences.nodeIntegration = false
    preferences.nodeIntegrationInSubFrames = false
    preferences.contextIsolation = true
    preferences.sandbox = true
    preferences.webSecurity = true
    if (params.src && !allowed(params.src)) event.preventDefault()
  })

  // A link that would open a new window opens in the same node instead, and a page can't send
  // its node anywhere but the web.
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) contents.loadURL(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!allowed(url)) event.preventDefault()
    })
    // A page with the keyboard gets every key, the app's shortcuts too: those go on to the app
    // instead, as if pressed there.
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
      const shortcut = input.shift ? APP_KEYS.has(input.code) : input.code === 'Comma'
      if (!shortcut || win.isDestroyed()) return
      event.preventDefault()
      win.webContents.send('browser:key', { code: input.code, key: input.key, shift: input.shift })
    })
  })

  ipcMain.on('browser:attach', (_ev, workspaceId, nodeId, contentsId) => {
    pages.set(key(workspaceId, nodeId), contentsId)
  })
  ipcMain.on('browser:detach', (_ev, workspaceId, nodeId) => {
    pages.delete(key(workspaceId, nodeId))
  })

  win.on('closed', () => {
    ipcMain.removeAllListeners('browser:attach')
    ipcMain.removeAllListeners('browser:detach')
    pages.clear()
  })
}

// What `nara browser` does to a linked browser node's page. `action` is 'open', 'read', 'shot'
// or 'reload'.
export async function browse(workspaceId, nodeId, action, text) {
  const contents = page(workspaceId, nodeId)
  if (action === 'open') {
    const url = normalizeUrl(text)
    if (!url) throw new Error('missing address, e.g. nara browser open 3 localhost:5173')
    if (!allowed(url)) throw new Error(`only web addresses can be opened: ${url}`)
    // loadURL settles once the page has loaded; a page that never finishes shouldn't hang `nara`.
    await Promise.race([
      contents.loadURL(url).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 15000))
    ])
    return { url: contents.getURL(), title: contents.getTitle() }
  }
  if (action === 'reload') {
    contents.reload()
    return { url: contents.getURL() }
  }
  if (action === 'read') {
    const body = await contents.executeJavaScript(
      'document.body ? document.body.innerText : document.documentElement.innerText || ""',
      true
    )
    const all = String(body ?? '')
    return {
      url: contents.getURL(),
      title: contents.getTitle(),
      text: all.length > MAX_TEXT ? `${all.slice(0, MAX_TEXT)}\n… (cut: the page is long)` : all
    }
  }
  if (action === 'shot') {
    const image = await contents.capturePage()
    if (image.isEmpty()) throw new Error(`browser ${nodeId} is not on screen, so it can't be seen`)
    const file = join(tmpdir(), `nara-browser-${nodeId}-${Date.now()}.png`)
    await writeFile(file, image.toPNG())
    return { url: contents.getURL(), file }
  }
  throw new Error(`unknown browser action: ${action}`)
}

// The current address of a browser node's page, for `nara peers`.
export function pageUrl(workspaceId, nodeId) {
  const id = pages.get(key(workspaceId, nodeId))
  const contents = id && webContents.fromId(id)
  return contents && !contents.isDestroyed() ? contents.getURL() : null
}

function page(workspaceId, nodeId) {
  const id = pages.get(key(workspaceId, nodeId))
  const contents = id && webContents.fromId(id)
  if (!contents || contents.isDestroyed()) {
    throw new Error(`browser ${nodeId} isn't loaded yet: open its workspace in Nara`)
  }
  return contents
}

function allowed(url) {
  try {
    return SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function key(workspaceId, nodeId) {
  return `${workspaceId}:${nodeId}`
}
