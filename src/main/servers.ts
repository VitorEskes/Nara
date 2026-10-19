import { ipcMain, type BrowserWindow } from 'electron'
import { connect } from 'net'
import type { NodeId, RunningServer } from '../shared/types'

// The local servers the terminals of each workspace started: the addresses they print when they're
// up (Vite's "Local: http://localhost:5173/", Next's, Rails'...). A browser node lists the ones
// still answering, and one linked to the terminal opens it on its own (BrowserNode.tsx).

// A local address, as servers print them. 0.0.0.0 and [::] are what a server listens on, not where
// it's reached: they read as localhost.
const ADDRESS =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s'"`<>()[\]{}]*)?/g
const LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::/
// Colors and the other escape sequences terminals print, which can sit inside an address.
// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g
// What's kept of a terminal's output between chunks, for an address cut in two.
const TAIL = 120
// How long an address gets to answer before it counts as down, in ms.
const PROBE_TIMEOUT = 400

// By pty id, the end of its last chunk.
const tails = new Map<number, string>()
// By workspace, the servers seen, by origin.
const seen = new Map<string, Map<string, RunningServer>>()
let send: (channel: string, ...args: unknown[]) => void = () => {}

export function registerServers(win: BrowserWindow): void {
  send = (channel, ...args) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  // The servers of the workspace that answer now, the last one printed first.
  ipcMain.handle('servers:list', async (_ev, workspaceId: string) => {
    const all = [...(seen.get(workspaceId)?.values() ?? [])]
    const up = await Promise.all(all.map((server) => answers(server.url)))
    return all.filter((_, i) => up[i]).sort((a, b) => b.at - a.at)
  })
  win.on('closed', () => {
    ipcMain.removeHandler('servers:list')
    tails.clear()
    seen.clear()
  })
}

// A chunk of a terminal's output. Cheap when it has no local address, which is nearly always. An
// address at the very end of the chunk may go on in the next one: it waits for it, in the tail.
export function serverOutput(id: number, workspaceId: string, nodeId: NodeId, data: string): void {
  const text = (tails.get(id) ?? '') + data
  if (!LOCAL.test(text)) {
    tails.set(id, text.slice(-TAIL))
    return
  }
  const clean = text.replace(ESCAPES, '')
  let read = 0
  for (const match of clean.matchAll(ADDRESS)) {
    const end = match.index + match[0].length
    if (end === clean.length) break
    read = end
    found(workspaceId, nodeId, match[0])
  }
  tails.set(id, clean.slice(Math.max(read, clean.length - TAIL)))
}

function found(workspaceId: string, nodeId: NodeId, address: string): void {
  const url = address.replace(/[.,;:!?]+$/, '').replace(/\/\/(?:0\.0\.0\.0|\[::\])/, '//localhost')
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return
  }
  const servers = seen.get(workspaceId) ?? new Map<string, RunningServer>()
  seen.set(workspaceId, servers)
  const server = { url, nodeId, at: Date.now() }
  servers.set(origin, server)
  send('servers:found', workspaceId, server)
}

export function serverTerminalExited(id: number): void {
  tails.delete(id)
}

// Whether something listens at the address's host and port.
function answers(url: string): Promise<boolean> {
  let host: string
  let port: number
  try {
    const parsed = new URL(url)
    host = parsed.hostname.replace(/^\[|\]$/g, '')
    port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
  } catch {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const done = (up: boolean): void => {
      socket.destroy()
      resolve(up)
    }
    socket.setTimeout(PROBE_TIMEOUT, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}
