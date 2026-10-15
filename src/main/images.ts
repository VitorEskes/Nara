import { app, dialog, ipcMain, net, protocol, type BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'

// Images in notes. Each is copied into Nara's data folder under the hash of its bytes, so the same
// image added twice is kept once, and a note refers to it as nara-image://<file>: Markdown that
// stays short, and an image that survives the original being moved or deleted.
const SCHEME = 'nara-image'
const TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
}
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']

// Must run before the app is ready: a scheme's privileges can't change after.
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

export function registerImages(win: BrowserWindow): void {
  // Serves the files in the images folder, and nothing outside it.
  if (!protocol.isProtocolHandled(SCHEME)) {
    protocol.handle(SCHEME, (request) => {
      const name = basename(decodeURIComponent(new URL(request.url).hostname || ''))
      const file = join(folder(), name)
      if (!name || !existsSync(file)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(file).toString())
    })
  }

  // Asks for an image file: { url, name } or null.
  ipcMain.handle('notes:pick-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Add an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: EXTENSIONS }]
    })
    if (canceled || !filePaths[0]) return null
    const source = filePaths[0]
    const name = `${hash(readFileSync(source))}${extname(source).toLowerCase() || '.png'}`
    mkdirSync(folder(), { recursive: true })
    const target = join(folder(), name)
    if (!existsSync(target)) copyFileSync(source, target)
    return { url: `${SCHEME}://${name}`, name: basename(source, extname(source)) }
  })

  // An image pasted into a note, as its bytes: { url } or null.
  ipcMain.handle('notes:save-image', (_ev, bytes: ArrayBuffer, type: string) => {
    const extension = TYPES[type]
    if (!extension || !bytes) return null
    const buffer = Buffer.from(bytes)
    const name = `${hash(buffer)}${extension}`
    mkdirSync(folder(), { recursive: true })
    const target = join(folder(), name)
    if (!existsSync(target)) writeFileSync(target, buffer)
    return { url: `${SCHEME}://${name}` }
  })

  win.on('closed', () => {
    ipcMain.removeHandler('notes:pick-image')
    ipcMain.removeHandler('notes:save-image')
  })
}

function hash(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex').slice(0, 16)
}

function folder(): string {
  return join(app.getPath('userData'), 'images')
}
