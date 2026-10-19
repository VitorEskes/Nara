import { webContents, type BrowserWindow, type IpcMain, type WebContents } from 'electron'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { normalizeUrl } from '../shared/url'
import type { ConsoleLine, NodeId } from '../shared/types'

// Browser nodes: a <webview> on the canvas (BrowserNode.tsx). Their pages are locked down like any
// website's, and each one tells main its webContents once it's ready, so an agent linked to it
// can drive and read it with `nara browser` (messages.ts).

// The most of a page's text `nara browser read` prints.
const MAX_TEXT = 200 * 1024
// Only web pages: never a file of the user's, never anything that runs with more rights.
const SCHEMES = new Set(['http:', 'https:', 'about:'])

// The keys of the app's Ctrl+Shift shortcuts (renderer's shortcuts.ts): the app's own, the code
// view's and the review's.
const APP_KEYS = new Set(['KeyN', 'KeyW', 'KeyO', 'KeyB', 'KeyL', 'KeyE', 'KeyG'])

// `${workspaceId}:${nodeId}` -> webContents id.
const pages = new Map<string, number>()
// What each page wrote to its console since it last loaded, by webContents id: the last ones.
const consoles = new Map<number, ConsoleLine[]>()
const CONSOLE_LINES = 200
// Room left around an element in its screenshot, in pixels.
const SHOT_MARGIN = 12

export function registerBrowser(win: BrowserWindow, ipcMain: IpcMain): void {
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
    // The console, from the page's last load on.
    const id = contents.id
    consoles.set(id, [])
    contents.on('did-navigate', () => consoles.set(id, []))
    contents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
      const lines = consoles.get(id) ?? []
      lines.push({ level, text: message, source: sourceId || undefined, line: lineNumber })
      if (lines.length > CONSOLE_LINES) lines.splice(0, lines.length - CONSOLE_LINES)
      consoles.set(id, lines)
    })
    contents.once('destroyed', () => consoles.delete(id))
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

  ipcMain.on('browser:attach', (_ev, workspaceId: string, nodeId: NodeId, contentsId: number) => {
    pages.set(key(workspaceId, nodeId), contentsId)
  })
  ipcMain.on('browser:detach', (_ev, workspaceId: string, nodeId: NodeId) => {
    pages.delete(key(workspaceId, nodeId))
  })

  // A screenshot of part of a browser node's page, for the user's message about an element in it
  // (BrowserNode.tsx): the path of the PNG, or null if the page can't be seen.
  ipcMain.handle(
    'browser:shot',
    async (_ev, workspaceId: string, nodeId: NodeId, rect?: Electron.Rectangle) => {
      try {
        return (await browse(workspaceId, nodeId, 'shot', undefined, rect)).file ?? null
      } catch {
        return null
      }
    }
  )

  // The errors in a browser node's console, for the user's message about them.
  ipcMain.handle('browser:errors', (_ev, workspaceId: string, nodeId: NodeId) =>
    pageErrors(workspaceId, nodeId)
  )

  win.on('closed', () => {
    ipcMain.removeAllListeners('browser:attach')
    ipcMain.removeAllListeners('browser:detach')
    ipcMain.removeHandler('browser:shot')
    ipcMain.removeHandler('browser:errors')
    pages.clear()
    consoles.clear()
  })
}

// What `nara browser` does to a linked browser node's page. `action` is 'open', 'read', 'shot',
// 'console' or 'reload'. A shot can be of `rect`, part of the page in its CSS pixels.
export async function browse(
  workspaceId: string,
  nodeId: NodeId,
  action: string,
  text?: string,
  rect?: Electron.Rectangle
): Promise<{ url: string; title?: string; text?: string; file?: string }> {
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
  if (action === 'console') {
    const lines = consoles.get(contents.id) ?? []
    return {
      url: contents.getURL(),
      text: lines.length ? lines.map(consoleLine).join('\n') : '(nothing in the console)'
    }
  }
  if (action === 'shot') {
    const image = await contents.capturePage(rect && around(rect, contents.getZoomFactor()))
    if (image.isEmpty()) throw new Error(`browser ${nodeId} is not on screen, so it can't be seen`)
    const file = join(tmpdir(), `nara-browser-${nodeId}-${Date.now()}.png`)
    await writeFile(file, image.toPNG())
    return { url: contents.getURL(), file }
  }
  throw new Error(`unknown browser action: ${action}`)
}

// "error  Uncaught TypeError: x is undefined  (app.js:12)".
function consoleLine({ level, text, source, line }: ConsoleLine): string {
  const file = source && (source.split('/').pop() || source)
  const where = file ? `  (${file}${line ? `:${line}` : ''})` : ''
  return `${level.padEnd(7)} ${text}${where}`
}

// A box in the page's CSS pixels, with some room around it, as capturePage takes it.
function around(rect: Electron.Rectangle, zoom: number): Electron.Rectangle {
  const x = Math.max(0, Math.floor((rect.x - SHOT_MARGIN) * zoom))
  const y = Math.max(0, Math.floor((rect.y - SHOT_MARGIN) * zoom))
  return {
    x,
    y,
    width: Math.max(1, Math.ceil((rect.width + SHOT_MARGIN * 2) * zoom)),
    height: Math.max(1, Math.ceil((rect.height + SHOT_MARGIN * 2) * zoom))
  }
}

// The console's errors of a browser node's page.
function pageErrors(workspaceId: string, nodeId: NodeId): ConsoleLine[] {
  const id = pages.get(key(workspaceId, nodeId))
  return (id && consoles.get(id)?.filter((line) => line.level === 'error')) || []
}

// The current address of a browser node's page, for `nara peers`.
export function pageUrl(workspaceId: string, nodeId: NodeId): string | null {
  const id = pages.get(key(workspaceId, nodeId))
  const contents = id && webContents.fromId(id)
  return contents && !contents.isDestroyed() ? contents.getURL() : null
}

function page(workspaceId: string, nodeId: NodeId): WebContents {
  const id = pages.get(key(workspaceId, nodeId))
  const contents = id && webContents.fromId(id)
  if (!contents || contents.isDestroyed()) {
    throw new Error(`browser ${nodeId} isn't loaded yet: open its workspace in Nara`)
  }
  return contents
}

function allowed(url: string): boolean {
  try {
    return SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function key(workspaceId: string, nodeId: NodeId): string {
  return `${workspaceId}:${nodeId}`
}
