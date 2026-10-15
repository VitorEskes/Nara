import type { BrowserWindow } from 'electron'
import { rmSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { basename, delimiter, dirname, join } from 'path'
import nara from '../../resources/bin/nara?asset'
import { browse, pageUrl } from './browser'
import {
  HOOKS,
  currentCwd,
  endAgent,
  findTerminal,
  startAgent,
  startContext,
  terminals
} from './pty'
import { agentRun } from './agents'
import { AGENTS, agentForCommand } from '../shared/agents'
import { agentHook } from './status'
import { reportClaude } from './usage'
import { findRole } from './roles'
import { updateNode, workspaces } from './workspaces'
import type { CanvasNode, NodeId } from '../shared/types'

// What the `nara` command sends (cli.ts): which terminal it runs in, and what it asks for.
interface Request {
  from: string
  command: string
  action?: string
  to?: NodeId
  text?: string
  event?: string
  payload?: { message?: string; type?: string; rateLimits?: unknown }
  agent?: string
  args?: unknown
}

// Agents talk by running the `nara` command in their own terminal. The command talks to this
// server over a socket, and the server pastes the message into the terminal on the other end of
// the link as if someone had typed it. The agent there replies the same way.
// A note on the other end of a link works as a shared scratchpad: the agent reads and writes it.
// The pid in the name lets two Nara instances run at once without one stealing the other's socket.
const SOCKET = join(tmpdir(), `nara-${process.pid}.sock`)

// A terminal with only the shell in the foreground doesn't get messages: the Enter at the end
// would run the text as a command.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'nu', 'pwsh'])

export function registerMessages(win: BrowserWindow): Record<string, string> {
  // One request per connection: `nara` writes the JSON and ends its write side; the response
  // goes back after 'end'. allowHalfOpen lets the server write after the client closed its side.
  const server = createServer({ allowHalfOpen: true }, (conn) => {
    let request = ''
    conn.setEncoding('utf8')
    conn.on('data', (chunk) => (request += chunk))
    conn.on('end', async () => {
      let response
      try {
        response = await handle(JSON.parse(request), win)
      } catch (error) {
        response = { error: (error as Error).message }
      }
      conn.end(JSON.stringify(response))
    })
    conn.on('error', () => {})
  })
  // A socket left behind by a run that died without cleaning up would make listen fail.
  rmSync(SOCKET, { force: true })
  server.listen(SOCKET)

  win.on('closed', () => server.close())

  // What every terminal needs in its environment for `nara` to work inside it.
  return {
    PATH: `${dirname(nara)}${delimiter}${process.env.PATH}`,
    NARA_SOCK: SOCKET,
    NARA_ELECTRON: process.execPath,
    NARA_CLI: join(__dirname, 'cli.js'),
    // The shell integration's functions run `nara run` by its full path (shell.js).
    NARA_BIN: nara
  }
}

async function handle(
  { from, command, action, to, text, event, payload, agent, args }: Request,
  win: BrowserWindow
): Promise<object> {
  const sender = terminals.get(Number(from))
  if (!sender) throw new Error('this terminal no longer exists in Nara')

  if (command === 'hook') {
    agentHook(Number(from), event ?? '', payload ?? {})
    return { ok: true }
  }

  if (command === 'statusline') {
    reportClaude(payload?.rateLimits)
    return { ok: true }
  }
  const { workspaceId, nodeId } = sender

  // An agent CLI typed in a plain terminal (shell.js): what to start it with, as if the node had
  // opened with it. `agent` is the command typed; `args` are the user's own arguments.
  if (command === 'run') {
    const key = agentForCommand(agent)
    if (sender.agent) throw new Error(`an agent is already running in this terminal`)
    const node = workspaces.get(workspaceId)?.nodes.find((n) => n.id === nodeId)
    const cwd = currentCwd(workspaceId, nodeId) ?? node?.cwd
    // Any other CLI, started by hand with `nara run <cli>`: Nara doesn't know its flags or follow
    // what it does, so its context and role go in as its first message once it's up. A shell
    // would run that message as commands.
    if (!key) {
      const name = basename(String(agent ?? ''))
      if (!name || SHELLS.has(name)) throw new Error(`${name || 'that'} isn't an agent CLI`)
      const launch = agentRun({ agent: name, role: node?.role, nodeId, worktree: node?.worktree })
      startContext(Number(from), launch.message)
      return { command: agent, args: [], env: launch.env }
    }
    const launch = agentRun({
      agent: key,
      args: Array.isArray(args) ? args.map(String) : [],
      role: node?.role,
      nodeId,
      worktree: node?.worktree,
      cwd,
      hooks: key === 'claude' && HOOKS
    })
    startAgent(Number(from), { agent: key, session: launch.session, message: launch.message, cwd })
    return { command: AGENTS[key].command, args: launch.args, env: launch.env }
  }

  if (command === 'run-exit') {
    endAgent(Number(from))
    return { ok: true }
  }

  // Links have no direction: from→to works the same as to→from.
  const { nodes = [], links = [] } = workspaces.get(workspaceId) ?? {}
  const peers = links.flatMap((l) => (l.from === nodeId ? [l.to] : l.to === nodeId ? [l.from] : []))
  const nodeOf = (id: NodeId | undefined): CanvasNode | undefined =>
    nodes.find((node) => node.id === id)

  if (command === 'peers') {
    return {
      peers: peers.map((peerId) => {
        // The name the user gave the node, if any: new nodes are just "terminal 3".
        const title = nodeOf(peerId)?.title
        if (nodeOf(peerId)?.type === 'note') return { nodeId: peerId, type: 'note', title }
        if (nodeOf(peerId)?.type === 'browser') {
          return { nodeId: peerId, type: 'browser', title, url: pageUrl(workspaceId, peerId) }
        }
        const target = findTerminal(workspaceId, peerId)
        const program = target && foregroundProgram(target)
        const role = findRole(nodeOf(peerId)?.role)?.label.toLowerCase()
        return {
          nodeId: peerId,
          type: 'terminal',
          title,
          program,
          role,
          canReceive: !program || !SHELLS.has(program)
        }
      })
    }
  }

  if (command === 'send') {
    if (to === undefined || !peers.includes(to))
      throw new Error(`terminal ${to} is not linked to this one`)
    if (nodeOf(to)?.type === 'note') {
      throw new Error(`${to} is a note, not a terminal: use nara note write ${to} "..."`)
    }
    if (nodeOf(to)?.type === 'browser') {
      throw new Error(`${to} is a browser, not a terminal: use nara browser open ${to} <url>`)
    }
    const target = findTerminal(workspaceId, to)
    if (!target) throw new Error(`terminal ${to} no longer exists`)
    if (SHELLS.has(foregroundProgram(target))) {
      throw new Error(`terminal ${to} is not running an agent, only a shell`)
    }
    const clean = stripControlChars(text)
    if (!clean.trim()) throw new Error('empty message')

    // The header tells the agent on the other side who sent it and how to reply.
    const header = `[nara · message from terminal ${nodeId} · reply with: nara send ${nodeId} "..."]`
    win.webContents.send('pty:paste', target.id, `${header} ${clean}`)
    return { ok: true }
  }

  if (command === 'note') {
    if (to === undefined || !peers.includes(to))
      throw new Error(`note ${to} is not linked to this terminal`)
    const note = nodeOf(to)
    if (note?.type !== 'note') {
      throw new Error(`${to} is not a note: see nara peers`)
    }
    if (action === 'read') return { text: note.text ?? '' }

    // A note is just text in a textarea, but control characters would show up there as junk.
    const clean = stripControlChars(text)
    let next: string
    if (action === 'write') next = clean
    else if (action === 'append') {
      if (!clean) throw new Error('empty text')
      next = appendLine(note.text ?? '', clean)
    } else throw new Error(`unknown note action: ${action}`)

    updateNode(workspaceId, to, { text: next })
    win.webContents.send('workspace:note-written', workspaceId, to, next)
    return { ok: true }
  }

  if (command === 'browser') {
    if (to === undefined || !peers.includes(to))
      throw new Error(`browser ${to} is not linked to this terminal`)
    if (nodeOf(to)?.type !== 'browser') throw new Error(`${to} is not a browser`)
    return browse(workspaceId, to, action ?? '', text)
  }

  throw new Error(`unknown command: ${command}`)
}

// Appended text starts on a line of its own.
function appendLine(text: string, line: string): string {
  return text && !text.endsWith('\n') ? `${text}\n${line}` : text + line
}

// Program in the terminal's foreground (the agent, or the shell itself if nothing is running).
// node-pty returns argv[0], which sometimes includes a path: /usr/bin/zsh.
function foregroundProgram({ term }: { term: { process: string } }): string {
  return basename(term.process)
}

// Strips control characters (except \n and \t). An ESC in the text would become a key sequence
// in the target terminal: it would end the paste halfway and the rest would arrive as typing.
function stripControlChars(text: unknown = ''): string {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
}
