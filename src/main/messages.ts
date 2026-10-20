import type { BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { createServer } from 'net'
import { basename, delimiter, dirname, join } from 'path'
import nara from '../../resources/bin/nara?asset&asarUnpack'
import { browse, pageUrl } from './browser'
import {
  currentCwd,
  endAgent,
  findTerminal,
  holdMessage,
  holdMessages,
  startAgent,
  startContext,
  terminals
} from './pty'
import { agentRun, contextGiven } from './agents'
import { AGENTS, agentForCommand, pickedModel } from '../shared/agents'
import { MODELS, agentPrompt, roleProfile } from '../shared/prompt'
import { EDIT_TOOL } from './hooks'
import { git, mergeWorktree } from './git'
import { clearSocket, socketPath } from './socket'
import { agentHook, agentState } from './status'
import { reportClaude } from './usage'
import { findRole } from './roles'
import { updateNode, workspaces } from './workspaces'
import type { AgentState, CanvasNode, Link, NodeId, Role } from '../shared/types'

// What the `nara` command sends (cli.ts): which terminal it runs in, and what it asks for.
interface Request {
  from: string
  command: string
  action?: string
  to?: NodeId
  text?: string
  event?: string
  payload?: {
    message?: string
    type?: string
    session?: string
    tool?: string
    rateLimits?: unknown
  }
  agent?: string
  args?: unknown
}

// Agents talk by running `nara` in their terminal. The command reaches this server over a socket,
// and the server pastes the message into the terminal on the other end of the link as if someone
// had typed it.
const SOCKET = socketPath('nara')

// A terminal with only the shell in the foreground doesn't get messages: the Enter at the end
// would run the text as a command.
const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'tcsh',
  'csh',
  'nu',
  'pwsh',
  'powershell',
  'cmd'
])

export function registerMessages(win: BrowserWindow): Record<string, string> {
  // One request per connection: `nara` writes the JSON on one line, and the response goes back
  // before the connection closes. The line ends the request, not the end of `nara`'s write side:
  // a named pipe (Windows) can't stay open one way, and the response would be lost.
  const server = createServer({ allowHalfOpen: true }, (conn) => {
    let request = ''
    let answered = false
    const answer = async (): Promise<void> => {
      if (answered) return
      answered = true
      let response
      try {
        response = await handle(JSON.parse(request), win)
      } catch (error) {
        response = { error: (error as Error).message }
      }
      conn.end(JSON.stringify(response))
    }
    conn.setEncoding('utf8')
    conn.on('data', (chunk) => {
      request += chunk
      const end = request.indexOf('\n')
      if (end < 0) return
      request = request.slice(0, end)
      answer()
    })
    conn.on('end', answer)
    conn.on('error', () => {})
  })
  clearSocket(SOCKET)
  server.listen(SOCKET)

  win.on('closed', () => server.close())

  // What every terminal needs in its environment for `nara` to work inside it. The command's
  // folder is the one unpacked from app.asar (asarUnpack): a shell can't run a file inside it.
  return {
    PATH: `${dirname(nara)}${delimiter}${process.env.PATH}`,
    NARA_SOCK: SOCKET,
    NARA_ELECTRON: process.execPath,
    NARA_CLI: join(__dirname, 'cli.js'),
    // The shell integration's functions run `nara run` by its full path (shell.ts).
    NARA_BIN: nara
  }
}

async function handle(
  { from, command, action, to, text, event, payload, agent, args }: Request,
  win: BrowserWindow
): Promise<object> {
  const sender = terminals.get(Number(from))
  if (!sender) throw new Error('this terminal no longer exists in Nara')

  // The agents' hooks (main/hooks.ts). A prompt, the user's or a message from another agent, gets
  // the canvas as it is now (`context`); an edit by a role that delegates may be refused (`deny`).
  // `nara hook` puts either in the shape its CLI reads (cli.ts).
  if (command === 'hook') {
    agentHook(Number(from), event ?? '', payload ?? {})
    rememberConversation(sender, payload?.session, win)
    if (event === 'prompt') {
      const context = canvasText(Number(from), true)
      return context ? { context } : { ok: true }
    }
    if (event === 'edit') {
      if (payload?.tool && !EDIT_TOOL.test(payload.tool)) return { ok: true }
      const reason = editRefusal(sender.workspaceId, sender.nodeId)
      return reason ? { deny: reason } : { ok: true }
    }
    return { ok: true }
  }

  if (command === 'statusline') {
    reportClaude(payload?.rateLimits)
    return { ok: true }
  }
  const { workspaceId, nodeId } = sender

  // An agent CLI typed in a plain terminal (shell.ts): what to start it with, as if the node had
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
      const launch = agentRun({
        agent: name,
        role: node?.role,
        model: node?.model,
        nodeId,
        worktree: node?.worktree
      })
      startContext(Number(from), launch.message)
      return { command: agent, args: [], env: launch.env }
    }
    const launch = agentRun({
      agent: key,
      args: Array.isArray(args) ? args.map(String) : [],
      role: node?.role,
      model: node?.model,
      nodeId,
      worktree: node?.worktree,
      cwd,
      hooks: true
    })
    startAgent(Number(from), { agent: key, session: launch.session, message: launch.message, cwd })
    return { command: AGENTS[key].command, args: launch.args, env: launch.env }
  }

  if (command === 'run-exit') {
    endAgent(Number(from))
    return { ok: true }
  }

  const { nodes = [], links = [] } = workspaces.get(workspaceId) ?? {}
  const peers = linkedTo(links, nodeId)
  const nodeOf = (id: NodeId | undefined): CanvasNode | undefined =>
    nodes.find((node) => node.id === id)

  if (command === 'peers') {
    return { peers: peers.map((peerId) => peerInfo(workspaceId, peerId, nodeOf(peerId))) }
  }

  if (command === 'canvas') return { text: canvasText(Number(from), false) }

  if (command === 'send') {
    if (to === undefined || !peers.includes(to))
      throw new Error(`terminal ${to} is not linked to this one`)
    if (nodeOf(to)?.type === 'note') {
      throw new Error(`${to} is a note, not a terminal: use nara note write ${to} "..."`)
    }
    if (nodeOf(to)?.type === 'browser') {
      throw new Error(`${to} is a browser, not a terminal: use nara browser open ${to} <url>`)
    }
    const clean = stripControlChars(text)
    if (!clean.trim()) throw new Error('empty message')
    // The header tells the agent on the other side who sent it and how to reply.
    const header = `[nara · message from terminal ${nodeId} · reply with: nara send ${nodeId} "..."]`
    const message = `${header} ${clean}`
    // An agent restarting on a new model gets it once it's back up.
    if (holdMessage(workspaceId, to, message)) return { ok: true }

    const target = findTerminal(workspaceId, to)
    if (!target) throw new Error(`terminal ${to} no longer exists`)
    if (SHELLS.has(foregroundProgram(target))) {
      throw new Error(`terminal ${to} is not running an agent, only a shell`)
    }
    // An agent whose CLI has no hook for its prompts (Aider, or one Nara doesn't know) gets the
    // canvas with the message instead, when there's something new on it.
    const canvas = target.agent && target.agent !== 'aider' ? '' : canvasText(target.id, true)
    win.webContents.send('pty:paste', target.id, canvas ? `${message}\n\n${canvas}` : message)
    return { ok: true }
  }

  // The model a linked agent runs on, picked by an agent whose role delegates: the node restarts
  // on it (renderer's Workspace.tsx) and resumes its conversation, if it has one yet. "default"
  // goes back to the role's model, or the CLI's own. An agent typed in a plain terminal isn't
  // restarted: it gets the model the next time it's started there (`nara run`).
  if (command === 'model') {
    coordinator(workspaceId, nodeId)
    if (to === undefined || !peers.includes(to))
      throw new Error(`terminal ${to} is not linked to this one`)
    const target = nodeOf(to)
    const typed = target?.type === 'terminal' && !target.agent
    const agent = !target ? undefined : typed ? findTerminal(workspaceId, to)?.agent : target.agent
    const cli = agent ? AGENTS[agent] : undefined
    if (!target || !agent || !cli) {
      throw new Error(`terminal ${to} isn't running an agent Nara knows: it takes no model`)
    }
    if (!cli.model) throw new Error(`terminal ${to} runs ${cli.label}, which takes no model`)
    const word = String(text ?? '').trim()
    const model =
      word.toLowerCase() === 'default' ? '' : agent === 'claude' ? word.toLowerCase() : word
    if (!word || (model && !pickedModel(agent, model))) {
      const list = cli.model.list ? ` (\`${cli.model.list}\` lists them)` : ''
      throw new Error(
        `unknown model "${word}": ${cli.label} takes ${cli.model.names}${list}, or default`
      )
    }
    const state = agentState(workspaceId, to)
    if (state === 'working' || state === 'waiting') {
      throw new Error(`terminal ${to} is ${STATES[state]}: switch its model once it's idle`)
    }
    const name = modelOf({ ...target, agent }, model)
    if ((target.model ?? '') === model) return { text: `terminal ${to} already runs on ${name}` }
    if (!typed) holdMessages(workspaceId, to)
    updateNode(workspaceId, to, { model })
    win.webContents.send('workspace:node-changed', workspaceId, to, { model })
    if (typed) {
      return {
        text: `terminal ${to} runs ${cli.label} in a plain terminal: it gets ${name} the next time ${cli.command} is started there`
      }
    }
    const resumes =
      agent === 'claude' || agent === 'aider' || target.conversation
        ? 'resuming its conversation'
        : 'in a new conversation, since it had none yet'
    return {
      text: `terminal ${to} restarts on ${name}, ${resumes}; messages sent now reach it once it's back`
    }
  }

  // Merges a linked agent's worktree branch into the branch it was made from, for an agent whose
  // role delegates: what the user would do from the inspector. Only what's committed goes in, and
  // a merge that conflicts is undone, with the files it conflicted on.
  if (command === 'merge') {
    coordinator(workspaceId, nodeId)
    if (to === undefined || !peers.includes(to))
      throw new Error(`terminal ${to} is not linked to this one`)
    const worktree = nodeOf(to)?.worktree
    if (!worktree) {
      throw new Error(
        `terminal ${to} has no worktree of its own: its changes are already in its folder`
      )
    }
    const { path, root, branch, base } = worktree
    if ((await git(path, ['status', '--porcelain'])).trim()) {
      throw new Error(`terminal ${to} has uncommitted changes on ${branch}: ask it to commit them`)
    }
    const ahead = Number((await git(root, ['rev-list', '--count', `${base}..${branch}`])).trim())
    if (!ahead) return { text: `${branch} has nothing that isn't in ${base} yet` }
    const result = await mergeWorktree(worktree)
    if (result.conflict) {
      return {
        conflict: result.conflict,
        text: `${branch} conflicts with ${base}, so the merge was undone`
      }
    }
    if (result.error) throw new Error(result.error)
    return {
      text: `merged ${branch} into ${base} (${ahead} commit${ahead === 1 ? '' : 's'}) in ${root}`
    }
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

// The conversation an agent's CLI reported from its hooks, saved with its node so the node resumes
// it (main/agents.ts). Claude Code's is the session Nara gave it, and an agent typed in a plain
// terminal starts afresh each time. The context it started with counts as told, so resuming
// doesn't tell it again.
function rememberConversation(
  sender: { workspaceId: string; nodeId: NodeId; agent?: string },
  session: unknown,
  win: BrowserWindow
): void {
  const { workspaceId, nodeId, agent } = sender
  if (typeof session !== 'string' || !/^[\w.:-]{1,200}$/.test(session)) return
  const node = workspaces.get(workspaceId)?.nodes.find((n) => n.id === nodeId)
  if (!node || !agent || agent === 'claude' || node.agent !== agent) return
  if (node.conversation === session) return
  updateNode(workspaceId, nodeId, { conversation: session })
  win.webContents.send('workspace:node-changed', workspaceId, nodeId, { conversation: session })
  if (AGENTS[agent]?.context !== 'system') {
    contextGiven(session, agentPrompt(nodeId, findRole(node.role), node.worktree))
  }
}

// The nodes linked to one. Links have no direction: from→to works the same as to→from.
function linkedTo(links: Link[], nodeId: NodeId): NodeId[] {
  return links.flatMap((l) => (l.from === nodeId ? [l.to] : l.to === nodeId ? [l.from] : []))
}

interface Peer {
  nodeId: NodeId
  type: 'terminal' | 'note' | 'browser'
  title?: string
  url?: string | null
  program?: string | null
  role?: string
  model?: string
  branch?: string
  state?: AgentState | null
  canReceive?: boolean
}

// What `nara peers` and the canvas say about a node.
function peerInfo(workspaceId: string, peerId: NodeId, node: CanvasNode | undefined): Peer {
  // The name the user gave the node, if any: new nodes are just "terminal 3".
  const title = node?.title
  if (node?.type === 'note') return { nodeId: peerId, type: 'note', title }
  if (node?.type === 'browser') {
    return { nodeId: peerId, type: 'browser', title, url: pageUrl(workspaceId, peerId) }
  }
  const target = findTerminal(workspaceId, peerId)
  const program = target && foregroundProgram(target)
  return {
    nodeId: peerId,
    type: 'terminal',
    title,
    program,
    role: findRole(node?.role)?.label.toLowerCase(),
    model: node?.agent && AGENTS[node.agent]?.model ? modelOf(node) : undefined,
    branch: node?.worktree
      ? `on ${node.worktree.branch}, from ${node.worktree.base}`
      : node?.agent && 'no worktree, in a shared folder',
    state: agentState(workspaceId, peerId),
    canReceive: !program || !SHELLS.has(program)
  }
}

// The model an agent node runs on: the one picked for it, or else its role's (Claude Code) or its
// CLI's own.
function modelOf(node: CanvasNode, picked = node.model): string {
  const own = pickedModel(node.agent, picked)
  if (node.agent !== 'claude') return own || "its CLI's default model"
  const model = own || roleProfile(findRole(node.role)).model
  return model ? MODELS[model].label.toLowerCase() : 'default model'
}

// Only an agent whose role delegates (shared/prompt.ts) picks models and merges for the others.
function coordinator(workspaceId: string, nodeId: NodeId): void {
  const node = workspaces.get(workspaceId)?.nodes.find((n) => n.id === nodeId)
  if (roleProfile(findRole(node?.role)).access !== 'delegate') {
    throw new Error('only an agent whose role delegates (like the Orchestrator) can do that')
  }
}

// The linked terminals with a live agent in them: the ones a role that delegates hands work to.
function linkedAgents(workspaceId: string, nodeId: NodeId): NodeId[] {
  const { links = [] } = workspaces.get(workspaceId) ?? {}
  return linkedTo(links, nodeId).filter((peerId) => {
    const state = agentState(workspaceId, peerId)
    return state !== null && state !== 'failed'
  })
}

// Why an agent whose role delegates (shared/prompt.ts) can't edit a file right now, or null if it
// can: it may only while no agent is linked to it.
function editRefusal(workspaceId: string, nodeId: NodeId): string | null {
  const node = workspaces.get(workspaceId)?.nodes.find((n) => n.id === nodeId)
  const role = findRole(node?.role)
  if (!role || roleProfile(role).access !== 'delegate') return null
  const agents = linkedAgents(workspaceId, nodeId)
  if (!agents.length) return null
  const list = agents.map((id) => `terminal ${id}`).join(', ')
  return `You are the ${role.label} and ${list} ${agents.length > 1 ? 'are' : 'is'} linked to you: hand this change to ${agents.length > 1 ? 'one of them' : 'it'} with nara send instead of making it yourself. You may edit files only while no agent is linked to you.`
}

// What an agent was last shown of each other node on the canvas, by pty id, so the next turn can
// say what changed: whether it was linked, its name, its role and, for a note, its text.
interface Shown {
  linked: boolean
  name: string
  role?: string
  model?: string
  text?: string
}
const shown = new Map<number, Map<NodeId, Shown>>()

const STATES: Record<AgentState, string> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting on the user',
  review: 'idle, finished its last turn',
  failed: 'stopped with an error'
}

// The canvas as one agent sees it: its role, what's linked to it and what isn't, and, with `track`
// (a new turn), what changed since the previous one. Empty when there's nothing to tell: no role
// and no other node.
// Only an agent whose role delegates gets all of it on every turn, since it plans around the whole
// canvas. The others get what's linked to them, on their first turn and then only when that
// changes: they work from the task they were sent, and every line is read and paid for again.
// `nara canvas` (no `track`) always tells all of it.
function canvasText(ptyId: number, track: boolean): string {
  const terminal = terminals.get(ptyId)
  if (!terminal) return ''
  const { workspaceId, nodeId } = terminal
  const { nodes = [], links = [] } = workspaces.get(workspaceId) ?? {}
  const me = nodes.find((node) => node.id === nodeId)
  const peers = new Set(linkedTo(links, nodeId))
  const role = findRole(me?.role)
  const full = !track || roleProfile(role).access === 'delegate'

  const now = new Map<NodeId, Shown>()
  const linked: string[] = []
  const others: string[] = []
  for (const node of nodes) {
    if (node.id === nodeId) continue
    const peer = peerInfo(workspaceId, node.id, node)
    const name = nodeName(peer)
    const isLinked = peers.has(node.id)
    ;(isLinked ? linked : others).push(`- ${name}${nodeDetail(peer, node, isLinked)}`)
    now.set(node.id, {
      linked: isLinked,
      name,
      role: peer.role,
      model: peer.model,
      text: node.type === 'note' ? digest(node.text ?? '') : undefined
    })
  }

  const before = shown.get(ptyId)
  const changes = before ? canvasChanges(before, now, full) : []
  if (track) {
    for (const id of shown.keys()) if (!terminals.has(id)) shown.delete(id)
    shown.set(ptyId, now)
  }
  if (!role && !now.size && !changes.length) return ''
  if (!full && before && !changes.length) return ''

  const myName = me?.title && me.title !== `terminal ${nodeId}` ? ` "${me.title}"` : ''
  const lines = [
    `[nara · canvas · you are terminal ${nodeId}${myName}${role ? `, the ${role.label}` : ''}]`
  ]
  if (changes.length) lines.push('', 'Changed since your previous turn:', ...changes)
  lines.push('', linked.length ? 'Linked to you:' : 'Nothing is linked to you.', ...linked)
  if (full && others.length) {
    lines.push(
      '',
      'Elsewhere on the canvas, not linked to you (unreachable until the user links them):'
    )
    lines.push(...others)
  }
  if (role) lines.push('', roleReminder(workspaceId, nodeId, role))
  return lines.join('\n')
}

// What changed between two turns' canvases; without `all`, only around the nodes linked to the
// agent, then or now.
function canvasChanges(
  before: Map<NodeId, Shown>,
  now: Map<NodeId, Shown>,
  all: boolean
): string[] {
  const changes: string[] = []
  for (const [id, node] of now) {
    const old = before.get(id)
    if (!all && !node.linked && !old?.linked) continue
    if (!old) {
      changes.push(
        `- ${node.name} was added to the canvas${node.linked ? ' and linked to you' : ''}`
      )
      continue
    }
    if (old.linked !== node.linked) {
      changes.push(`- ${node.name} was ${node.linked ? 'linked to you' : 'unlinked from you'}`)
    }
    if (old.name !== node.name) changes.push(`- ${old.name} was renamed: ${node.name}`)
    if (old.role !== node.role) {
      changes.push(
        `- ${node.name} ${node.role ? `is now the ${node.role}` : 'no longer has a role'}`
      )
    }
    if (old.model !== node.model && node.model) {
      changes.push(`- ${node.name} now runs on ${node.model}`)
    }
    if (node.linked && old.text !== node.text) changes.push(`- ${node.name} was edited`)
  }
  for (const [id, old] of before) {
    if (!now.has(id) && (all || old.linked))
      changes.push(`- ${old.name} was removed from the canvas`)
  }
  return changes
}

// What the agent's role asks of it on this turn, given the canvas.
function roleReminder(workspaceId: string, nodeId: NodeId, role: Role): string {
  if (roleProfile(role).access !== 'delegate') {
    return `You are the ${role.label}: act as your role says.`
  }
  const agents = linkedAgents(workspaceId, nodeId)
  if (!agents.length) {
    return `You are the ${role.label} and no agent is linked to you: do the work yourself.`
  }
  const list = agents.map((id) => `terminal ${id}`).join(', ')
  const lines = [
    `You are the ${role.label}: hand the work to the agents linked to you (${list}), each as its role fits, and don't edit files yourself. Nara refuses your editing tools while they're linked.`
  ]
  // How each CLI among them names its models, for `nara model`: Claude Code's are in the prompt.
  const { nodes = [] } = workspaces.get(workspaceId) ?? {}
  const clis = new Set(agents.map((id) => nodes.find((node) => node.id === id)?.agent))
  for (const agent of clis) {
    const cli = agent && agent !== 'claude' ? AGENTS[agent] : undefined
    if (!cli?.model) continue
    const listed = cli.model.list ? `; \`${cli.model.list}\` lists them` : ''
    lines.push(`nara model for ${cli.label}: ${cli.model.names}${listed}.`)
  }
  return lines.join('\n')
}

function nodeName(peer: Peer): string {
  const name = peer.title && peer.title !== `${peer.type} ${peer.nodeId}` ? ` "${peer.title}"` : ''
  return `${peer.type} ${peer.nodeId}${name}`
}

// A node's line after its name: a terminal's program, role and state, how far a note's checklist
// has got, a browser's page.
function nodeDetail(peer: Peer, node: CanvasNode, linked: boolean): string {
  if (peer.type === 'note') {
    const text = node.text ?? ''
    if (!text.trim()) return '  empty'
    const open = text.match(/^\s*[-*] \[ \]/gm)?.length ?? 0
    const done = text.match(/^\s*[-*] \[[xX]\]/gm)?.length ?? 0
    const lines = text.trim().split('\n').length
    const checklist = open + done ? `, checklist ${done}/${open + done} done` : ''
    return `  ${lines} line${lines === 1 ? '' : 's'}${checklist}`
  }
  if (peer.type === 'browser') return `  ${peer.url || '(not loaded)'}`
  const parts = [
    peer.program,
    peer.role && `(${peer.role})`,
    peer.model,
    peer.branch,
    peer.state && STATES[peer.state],
    linked && !peer.canReceive && "shell only, can't receive messages"
  ]
  const detail = parts.filter(Boolean).join('  ')
  return detail ? `  ${detail}` : ''
}

function digest(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

// Appended text starts on a line of its own.
function appendLine(text: string, line: string): string {
  return text && !text.endsWith('\n') ? `${text}\n${line}` : text + line
}

// Program in the terminal's foreground (the agent, or the shell itself if nothing is running).
// node-pty returns argv[0], which sometimes includes a path: /usr/bin/zsh.
// Windows only knows the program a terminal started with, its shell: there, the agent Nara
// started in it stands for what's in the foreground.
function foregroundProgram({ term, agent }: { term: { process: string }; agent?: string }): string {
  if (process.platform === 'win32' && agent) return AGENTS[agent]?.command ?? agent
  return basename(term.process).replace(/\.exe$/i, '')
}

// Strips control characters (except \n and \t). An ESC in the text would become a key sequence
// in the target terminal: it would end the paste halfway and the rest would arrive as typing.
function stripControlChars(text: unknown = ''): string {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
}
