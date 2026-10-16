import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { rmSync } from 'fs'
import { createServer, type Socket } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { replyToAgent } from './pty'
import { onStatuses, seenAgent } from './status'
import type { AgentReply, AgentStatus, NodeId, PetConfig } from '../shared/types'

// What the pet's process sends (petProcess.ts).
type PetMessage =
  | { type: 'reply'; id: number; workspaceId: string; nodeId: NodeId; reply: AgentReply }
  | { type: 'seen'; workspaceId: string; nodeId: NodeId }
  | { type: 'jump'; status: AgentStatus }

// The desktop pet: the pet lives outside Nara's window, over every app on the screen, for as long
// as one is picked in the settings. It runs as a second Electron process of the app itself (the
// `--nara-pet` flag, petProcess.js), because a window that stays on top and is placed where the
// user leaves it is something only X11 grants: under Wayland the compositor decides both, so there
// the pet's process runs through XWayland while the app stays on Wayland.
//
// The two talk over a socket, one JSON message per line. The app sends the agents' statuses and
// the pet's settings; the pet sends the user's answers to the agents and asks to be taken to one.
export const PET_FLAG = '--nara-pet'
// A pet process that dies on its own is started again, after this long, at most this many times.
const RESPAWN_AFTER = 2000
const RESPAWN_MAX = 5

export function registerDesktopPet(main: BrowserWindow): void {
  const socket = join(tmpdir(), `nara-pet-${process.pid}.sock`)
  let config: PetConfig = { pet: null, size: 'm' }
  let child: ChildProcess | null = null
  let peer: Socket | null = null
  let respawns = 0
  let stopping = false
  let stopStatuses = (): void => {}

  function message(data: object): void {
    if (peer && !peer.destroyed) peer.write(`${JSON.stringify(data)}\n`)
  }

  const server = createServer((conn) => {
    peer?.destroy()
    peer = conn
    let buffer = ''
    conn.setEncoding('utf8')
    conn.on('data', (chunk) => {
      buffer += chunk
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        try {
          handle(JSON.parse(line))
        } catch {
          // A line that isn't a message.
        }
      }
    })
    conn.on('error', () => {})
    conn.on('close', () => peer === conn && (peer = null))
    message({ type: 'prefs', ...config })
    stopStatuses()
    stopStatuses = onStatuses((statuses) => message({ type: 'status', statuses }))
  })
  rmSync(socket, { force: true })
  server.listen(socket)

  function handle(data: PetMessage): void {
    if (data.type === 'reply') {
      const ok = replyToAgent(data.workspaceId, data.nodeId, data.reply)
      message({ type: 'replied', id: data.id, ok })
    } else if (data.type === 'seen') {
      seenAgent(data.workspaceId, data.nodeId)
    } else if (data.type === 'jump') {
      // Nara comes to the front and its pet takes the user there, as from the HUD.
      if (main.isDestroyed()) return
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
      main.webContents.send('agents:jump', data.status)
    }
  }

  function start(): void {
    if (child) return
    stopping = false
    const args = [
      // Wayland won't keep a window on top or let it place itself; XWayland does both.
      ...(process.platform === 'linux' && process.env.WAYLAND_DISPLAY
        ? ['--ozone-platform=x11']
        : []),
      // In development Electron is told where the app is; a packaged app knows.
      ...(app.isPackaged ? [] : [app.getAppPath()]),
      PET_FLAG
    ]
    const env: NodeJS.ProcessEnv = { ...process.env, NARA_PET_SOCK: socket }
    delete env.ELECTRON_RUN_AS_NODE
    child = spawn(process.execPath, args, { env, stdio: ['ignore', 'inherit', 'inherit'] })
    child.on('exit', () => {
      child = null
      stopStatuses()
      if (stopping || !config.pet || respawns >= RESPAWN_MAX) return
      respawns++
      setTimeout(() => config.pet && start(), RESPAWN_AFTER)
    })
  }

  function stop(): void {
    stopping = true
    stopStatuses()
    child?.kill()
    child = null
  }

  // The renderer says which pet, if any, and its size, from the settings.
  ipcMain.on('pet:configure', (_ev, next?: Partial<PetConfig>) => {
    config = { pet: next?.pet ?? null, size: next?.size ?? 'm' }
    if (!config.pet) return stop()
    respawns = 0
    if (child) message({ type: 'prefs', ...config })
    else start()
  })

  main.on('closed', () => {
    stop()
    server.close()
    ipcMain.removeAllListeners('pet:configure')
  })
  app.on('will-quit', stop)
}
