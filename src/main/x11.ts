import { connect, type Socket } from 'net'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// A few words of the X11 protocol, spoken straight over the X server's socket: enough to ask the
// window manager to change a window's _NET_WM_STATE, as EWMH says a client must once its window
// is on screen. Electron's own setSkipTaskbar never reaches the window manager under X11 (XWayland
// included), so the desktop pet would show in the taskbar and the window switcher, beside Nara.
//
// No native module: the connection setup, InternAtom and SendEvent are short fixed layouts.

const ADD = 1
const REMOVE = 0
// The event mask a window manager listens on the root window with.
const SUBSTRUCTURE = (1 << 19) | (1 << 20)
const TIMEOUT = 3000

// Asks the window manager to add the states to the window and take the others off, by their
// atoms' names (_NET_WM_STATE_SKIP_TASKBAR...).
export async function setWindowState(
  window: number,
  { add, remove = [] }: { add: string[]; remove?: string[] }
): Promise<void> {
  const target = display()
  if (!target) return
  const socket = connect(target.path)
  try {
    const conn = await open(socket, target.number)
    const [type, ...states] = await conn.atoms(['_NET_WM_STATE', ...add, ...remove])
    // Each message carries up to two states; 1 says it comes from an application.
    const send = (action: number, list: number[]): void => {
      for (let i = 0; i < list.length; i += 2) {
        conn.message(window, type, [action, list[i], list[i + 1] ?? 0, 1])
      }
    }
    send(ADD, states.slice(0, add.length))
    send(REMOVE, states.slice(add.length))
    await new Promise<void>((resolve) => socket.end(resolve))
  } finally {
    socket.destroy()
  }
}

// The local X server in DISPLAY (":0", ":1.0"): its number and socket. One on another machine
// (ssh -X) is left alone.
function display(): { number: string; path: string } | null {
  const match = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(process.env.DISPLAY ?? '')
  return match ? { number: match[1], path: `/tmp/.X11-unix/X${match[1]}` } : null
}

interface Connection {
  atoms: (names: string[]) => Promise<number[]>
  message: (window: number, type: number, data: number[]) => void
}

async function open(socket: Socket, number: string): Promise<Connection> {
  const reader = replies(socket)
  const { name, data } = cookie(number)
  const setup = Buffer.concat([
    header(),
    Buffer.from(name),
    Buffer.alloc(pad(name.length)),
    data,
    Buffer.alloc(pad(data.length))
  ])
  function header(): Buffer {
    const b = Buffer.alloc(12)
    b.writeUInt8(0x6c, 0) // little-endian
    b.writeUInt16LE(11, 2)
    b.writeUInt16LE(0, 4)
    b.writeUInt16LE(name.length, 6)
    b.writeUInt16LE(data.length, 8)
    return b
  }
  socket.write(setup)
  const head = await reader.read(8)
  const rest = await reader.read(head.readUInt16LE(6) * 4)
  if (head[0] !== 1) throw new Error('the X server refused the connection')
  // The root window of the first screen, after the vendor's name and the pixmap formats.
  const vendor = rest.readUInt16LE(16)
  const formats = rest.readUInt8(21)
  const root = rest.readUInt32LE(32 + vendor + pad(vendor) + formats * 8)

  return {
    async atoms(names) {
      for (const atom of names) {
        const length = Buffer.byteLength(atom)
        const b = Buffer.alloc(8 + length + pad(length))
        b.writeUInt8(16, 0) // InternAtom
        b.writeUInt16LE(b.length / 4, 2)
        b.writeUInt16LE(length, 4)
        b.write(atom, 8)
        socket.write(b)
      }
      const atoms: number[] = []
      while (atoms.length < names.length) {
        const reply = await reader.read(32)
        if (reply[0] !== 1) throw new Error(`X error ${reply[1]}`)
        atoms.push(reply.readUInt32LE(8))
      }
      return atoms
    },
    message(window, type, data) {
      const req = Buffer.alloc(44)
      req.writeUInt8(25, 0) // SendEvent
      req.writeUInt16LE(11, 2)
      req.writeUInt32LE(root, 4)
      req.writeUInt32LE(SUBSTRUCTURE, 8)
      req.writeUInt8(33, 12) // ClientMessage
      req.writeUInt8(32, 13)
      req.writeUInt32LE(window, 16)
      req.writeUInt32LE(type, 20)
      data.forEach((value, i) => req.writeUInt32LE(value >>> 0, 24 + i * 4))
      socket.write(req)
    }
  }
}

// What comes back over the socket, read a given number of bytes at a time.
function replies(socket: Socket): { read: (size: number) => Promise<Buffer> } {
  let buffer = Buffer.alloc(0)
  let waiting: { size: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null =
    null
  const settle = (): void => {
    if (!waiting || buffer.length < waiting.size) return
    const chunk = buffer.subarray(0, waiting.size)
    buffer = buffer.subarray(waiting.size)
    const { resolve } = waiting
    waiting = null
    resolve(chunk)
  }
  const fail = (error: Error): void => {
    waiting?.reject(error)
    waiting = null
  }
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    settle()
  })
  socket.on('error', fail)
  socket.on('close', () => fail(new Error('the X server closed the connection')))
  socket.setTimeout(TIMEOUT, () => socket.destroy(new Error('the X server did not answer')))
  return {
    read: (size) =>
      new Promise((resolve, reject) => {
        waiting = { size, resolve, reject }
        settle()
      })
  }
}

// The MIT-MAGIC-COOKIE-1 for the display from the Xauthority file, or no authorization if there
// is none (an X server that doesn't ask for it).
function cookie(number: string): { name: string; data: Buffer } {
  const none = { name: '', data: Buffer.alloc(0) }
  let file: Buffer
  try {
    file = readFileSync(process.env.XAUTHORITY || join(homedir(), '.Xauthority'))
  } catch {
    return none
  }
  // Each entry: family, then address, display number, name and data, each with its length, all
  // big-endian.
  let at = 0
  const field = (): Buffer => {
    const length = file.readUInt16BE(at)
    const value = file.subarray(at + 2, at + 2 + length)
    at += 2 + length
    return value
  }
  while (at + 2 <= file.length) {
    try {
      at += 2
      field()
      const entry = field().toString()
      const name = field().toString()
      const data = field()
      if ((entry === number || entry === '') && name === 'MIT-MAGIC-COOKIE-1') return { name, data }
    } catch {
      break
    }
  }
  return none
}

function pad(length: number): number {
  return (4 - (length % 4)) % 4
}
