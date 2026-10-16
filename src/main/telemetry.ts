import { BrowserWindow, ipcMain } from 'electron'
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, join, relative } from 'path'
import { transcriptPath } from './agents'
import { claimEdit, editedFile } from './changes'
import { reportCodex } from './usage'
import type {
  Activity,
  AgentReport,
  AgentTask,
  NodeId,
  RemovedReport,
  Usage
} from '../shared/types'

// A line of an agent's transcript or rollout. Their formats belong to the agents and change
// between versions, so every field is read as maybe there.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = Record<string, any>

// One message's tokens, kept to replace them when the message's next line repeats its usage.
interface MessageUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  write1h: number
  model: string
  cost?: number
}

type NewActivity = Omit<Activity, 'id'>

interface Watcher {
  id: number
  workspaceId: string
  nodeId: NodeId
  agent: string
  session?: string
  cwd?: string
  started: number
  file: string | null
  offset: number
  rest: string
  model: string | null
  title: string | null
  usage: Usage
  messages: Map<string, MessageUsage>
  tasks: AgentTask[]
  activity: Activity[]
  pending: Map<string, NewActivity>
  lines: AgentReport['lines']
  nextActivity: number
}

// What each agent has spent and is doing, read from the files the agents keep of their own
// sessions: Claude Code's transcript (<config>/projects/<folder>/<session>.jsonl, under the session
// id Nara gave the node) and Codex's rollout (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, the
// newest one in the node's folder). Each new line adds to the agent's report:
//
//   { model, title, usage, tasks, activity, lines }
//
// - usage: tokens in, out and cached, summed over the session; `context` is how much of the
//   context window the last turn filled and `window` its size; `cost` is an estimate at API prices.
// - tasks: the agent's own task list (Claude Code's todos or tasks, Codex's plan).
// - activity: each tool it ran and each message it got, newest last.
//
// The files are only appended to, so each is read from where the last read stopped. Reports go to
// every window a second at most, and only for the agents that changed.
const POLL = 1500
const SEND_EVERY = 1000
// The most read from a file in one go, so a long resumed conversation is caught up over a few
// polls instead of blocking main.
const CHUNK = 4 * 1024 * 1024
const MAX_ACTIVITY = 150

// Prices per million tokens at the Anthropic API: [input, output, cache read]. Cache writes cost
// 1.25x input for 5 minutes and 2x for an hour. A subscription doesn't bill these; the cost says
// what the work would cost through the API.
const PRICES: [RegExp, [number, number, number]][] = [
  [/fable-5-1|mythos-5-1/, [10, 50, 0.25]],
  [/fable-5|mythos-5/, [10, 50, 1]],
  [/opus-5-5/, [4, 20, 0.2]],
  [/opus-(5|4-[5-8])/, [5, 25, 0.5]],
  [/opus-4/, [15, 75, 1.5]],
  [/sonnet-5/, [2, 10, 0.2]],
  [/sonnet/, [3, 15, 0.3]],
  [/haiku-5/, [0.1, 0.5, 0.01]],
  [/haiku-4/, [1, 5, 0.1]],
  [/haiku/, [0.8, 4, 0.08]]
]
// Context windows: the 4.5 and earlier Haikus and Sonnets have 200K, current models 1M.
const SMALL_WINDOW = /haiku-4|haiku-3|sonnet-4-5|sonnet-4-0|sonnet-4-2|opus-4-[0-5]|claude-3/
const WINDOW = 1_000_000
const SMALL = 200_000

// pty id -> watcher
const watchers = new Map<number, Watcher>()
const dirty = new Set<number>()
let timer: ReturnType<typeof setInterval> | undefined
let sender: ReturnType<typeof setInterval> | undefined

export function registerTelemetry(win: BrowserWindow): void {
  ipcMain.handle('telemetry:list', () => [...watchers.values()].map(report))
  timer = setInterval(poll, POLL)
  sender = setInterval(flush, SEND_EVERY)
  win.on('closed', () => {
    clearInterval(timer)
    clearInterval(sender)
    watchers.clear()
    ipcMain.removeHandler('telemetry:list')
  })
}

// Starts following an agent's session. `session` is Claude Code's session id; `cwd` and `started`
// find Codex's rollout.
export function watchAgent(
  id: number,
  {
    workspaceId,
    nodeId,
    agent,
    session,
    cwd
  }: Pick<Watcher, 'workspaceId' | 'nodeId' | 'agent' | 'session' | 'cwd'>
): void {
  for (const [other, w] of watchers) {
    if (w.workspaceId === workspaceId && w.nodeId === nodeId) watchers.delete(other)
  }
  watchers.set(id, {
    id,
    workspaceId,
    nodeId,
    agent,
    session,
    cwd,
    started: Date.now(),
    file: null,
    offset: 0,
    rest: '',
    model: null,
    title: null,
    usage: emptyUsage(),
    messages: new Map(),
    tasks: [],
    activity: [],
    pending: new Map(),
    lines: null,
    nextActivity: 1
  })
}

export function unwatchAgent(id: number): void {
  const w = watchers.get(id)
  if (!w) return
  watchers.delete(id)
  broadcast([{ workspaceId: w.workspaceId, nodeId: w.nodeId, removed: true }])
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    tokens: 0,
    cost: 0,
    context: 0,
    window: 0
  }
}

function poll(): void {
  for (const w of watchers.values()) {
    try {
      w.file ??= w.agent === 'claude' ? transcriptPath(w.session) : findRollout(w)
      if (w.file) read(w as Watcher & { file: string })
    } catch (error) {
      console.error(`nara: telemetry for terminal ${w.nodeId}: ${(error as Error).message}`)
    }
  }
}

function read(w: Watcher & { file: string }): void {
  const { size } = statSync(w.file)
  if (size < w.offset) {
    // The file was replaced: start over.
    Object.assign(w, {
      offset: 0,
      rest: '',
      usage: emptyUsage(),
      messages: new Map(),
      tasks: [],
      activity: []
    })
  }
  if (size === w.offset) return
  const length = Math.min(CHUNK, size - w.offset)
  const buffer = Buffer.alloc(length)
  const fd = openSync(w.file, 'r')
  try {
    readSync(fd, buffer, 0, length, w.offset)
  } finally {
    closeSync(fd)
  }
  w.offset += length
  const text = w.rest + buffer.toString('utf8')
  const lines = text.split('\n')
  // The last piece may be a line still being written.
  w.rest = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    let entry: Entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (w.agent === 'claude') claudeLine(w, entry)
    else codexLine(w, entry)
  }
  dirty.add(w.id)
}

// --- Claude Code

function claudeLine(w: Watcher, entry: Entry): void {
  if (entry.type === 'ai-title' && entry.aiTitle) w.title = entry.aiTitle
  if (entry.type === 'cost-state' && entry.totalLinesAdded + entry.totalLinesRemoved > 0) {
    w.lines = { added: entry.totalLinesAdded, removed: entry.totalLinesRemoved }
  }
  const message = entry.message
  if (!message || typeof message !== 'object') return
  const at = Date.parse(entry.timestamp) || Date.now()

  if (entry.type === 'assistant') {
    if (message.model && message.model !== '<synthetic>') w.model = message.model
    if (message.usage && message.id && message.model !== '<synthetic>') {
      countUsage(w, message.id, message.usage, message.model, !entry.isSidechain)
    }
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block?.type === 'tool_use') claudeTool(w, block, at, entry.isSidechain)
    }
  } else if (entry.type === 'user') {
    const content = message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_result') finishTool(w, block.tool_use_id, block.is_error)
      }
    }
    const text =
      typeof content === 'string'
        ? content
        : content?.find?.((b: Entry) => b?.type === 'text')?.text
    if (
      text &&
      !entry.isMeta &&
      !entry.isSidechain &&
      !text.startsWith('<') &&
      !text.startsWith('Caveat:')
    ) {
      const message = text.startsWith('[nara · message from')
      addActivity(w, {
        at,
        tool: message ? 'Message' : 'Prompt',
        kind: 'prompt',
        summary: message ? text.replace(/^\[nara · ([^\]]*)\]\s*/, '$1: ') : text,
        status: 'done'
      })
    }
  }
}

// A message's usage, which repeats on each line of the message: the latest replaces the earlier.
function countUsage(w: Watcher, id: string, usage: Entry, model: string, main: boolean): void {
  const previous = w.messages.get(id)
  const next: MessageUsage = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    write1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    model
  }
  next.cost = cost(next)
  w.messages.set(id, next)
  const u = w.usage
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost'] as const) {
    u[key] += (next[key] ?? 0) - (previous?.[key] ?? 0)
  }
  u.tokens = u.input + u.output + u.cacheRead + u.cacheWrite
  if (main) {
    u.context = next.input + next.cacheRead + next.cacheWrite + next.output
    u.window = SMALL_WINDOW.test(model) ? SMALL : WINDOW
  }
}

function cost({ input, output, cacheRead, cacheWrite, write1h, model }: MessageUsage): number {
  const price = PRICES.find(([pattern]) => pattern.test(model ?? ''))?.[1]
  if (!price) return 0
  const [inPrice, outPrice, readPrice] = price
  const write5m = cacheWrite - write1h
  return (
    (input * inPrice +
      output * outPrice +
      cacheRead * readPrice +
      write5m * inPrice * 1.25 +
      write1h * inPrice * 2) /
    1e6
  )
}

function claudeTool(w: Watcher, block: Entry, at: number, sidechain: boolean): void {
  const input: Entry = block.input ?? {}
  const name: string = block.name ?? 'Tool'
  if (name === 'TodoWrite' && Array.isArray(input.todos)) {
    w.tasks = input.todos.map((todo: Entry, i: number) => ({
      id: String(i + 1),
      text: todo.content ?? '',
      active: todo.activeForm,
      status: todo.status ?? 'pending'
    }))
    return
  }
  if (name === 'TaskCreate') {
    w.tasks = [
      ...w.tasks,
      {
        id: String(w.tasks.length + 1),
        text: input.subject ?? input.description ?? '',
        active: input.activeForm,
        status: 'pending'
      }
    ]
    return
  }
  if (name === 'TaskUpdate') {
    const id = String(input.taskId ?? '')
    w.tasks =
      input.status === 'deleted'
        ? w.tasks.filter((t) => t.id !== id)
        : w.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: input.status ?? t.status,
                  text: input.subject ?? t.text,
                  active: input.activeForm ?? t.active
                }
              : t
          )
    return
  }
  if (['TaskList', 'TaskGet', 'TaskOutput', 'ToolSearch'].includes(name)) return
  if (CLAUDE_EDITS.has(name)) claim(w, input.file_path ?? input.notebook_path, at)
  const entry: NewActivity = {
    at,
    tool: shortTool(name),
    ...describeTool(name, input, w.cwd),
    status: 'running'
  }
  if (sidechain) entry.summary = `↳ ${entry.summary}`
  addActivity(w, entry)
  if (block.id) w.pending.set(block.id, entry)
}

function describeTool(
  name: string,
  input: Entry,
  cwd?: string
): Pick<Activity, 'kind' | 'summary'> {
  const path = (p?: string): string =>
    p ? (cwd && p.startsWith(cwd) ? relative(cwd, p) || basename(p) : p) : ''
  switch (name) {
    case 'Read':
      return { kind: 'read', summary: path(input.file_path) }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return { kind: 'edit', summary: path(input.file_path ?? input.notebook_path) }
    case 'Bash':
      return { kind: 'run', summary: firstLine(input.description || input.command) }
    case 'Grep':
    case 'Glob':
      return { kind: 'read', summary: input.pattern ?? '' }
    case 'WebFetch':
      return { kind: 'read', summary: input.url ?? '' }
    case 'WebSearch':
      return { kind: 'read', summary: input.query ?? '' }
    case 'Task':
    case 'Agent':
      return { kind: 'run', summary: input.description ?? input.prompt ?? '' }
    default:
      return { kind: 'other', summary: firstLine(JSON.stringify(input)).slice(0, 120) }
  }
}

const CLAUDE_EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// The agent edited a file: it's this node's change (changes.ts). What was read back from before
// the node's agent started, as when a session is resumed, isn't.
function claim(w: Watcher, path: unknown, at: number): void {
  if (typeof path !== 'string' || !path || at < w.started - 5000) return
  claimEdit(w.workspaceId, w.nodeId, editedFile(path, w.cwd), at)
}

// The files a Codex patch adds, updates, deletes or moves to.
function patchFiles(patch: unknown): string[] {
  if (typeof patch !== 'string') return []
  return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map((m) =>
    m[1].trim()
  )
}

function shortTool(name: string): string {
  if (name.startsWith('mcp__')) return name.split('__').pop() ?? name
  return name === 'MultiEdit' ? 'Edit' : name === 'Agent' ? 'Task' : name
}

function finishTool(w: Watcher, id: string, error: boolean): void {
  const entry = w.pending.get(id)
  if (!entry) return
  w.pending.delete(id)
  entry.status = error ? 'error' : 'done'
}

// --- Codex

// The rollout Codex is writing for this node: the newest one, started after the node, in the
// node's folder, that no other node has taken.
function findRollout(w: Watcher): string | null {
  if (Date.now() - w.started < 1500) return null
  const root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
  const taken = new Set([...watchers.values()].map((other) => other.file).filter(Boolean))
  const days = [0, 1].map((back) => {
    const d = new Date(w.started - back * 86400000)
    return join(root, String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()))
  })
  let best: { file: string; time: number } | null = null
  for (const dir of days) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
      const file = join(dir, name)
      if (taken.has(file)) continue
      const { birthtimeMs, mtimeMs } = statSync(file)
      if (Math.max(birthtimeMs, mtimeMs) < w.started - 5000) continue
      const meta = firstJson(file)
      const cwd = meta?.payload?.cwd ?? meta?.cwd
      if (cwd && w.cwd && cwd !== w.cwd) continue
      if (!best || birthtimeMs > best.time) best = { file, time: birthtimeMs }
    }
  }
  return best?.file ?? null
}

function codexLine(w: Watcher, entry: Entry): void {
  const payload: Entry = entry.payload ?? entry
  const at = Date.parse(entry.timestamp) || Date.now()
  if (entry.type === 'turn_context' && payload.model) w.model = payload.model
  if (entry.type === 'event_msg' && payload.type === 'token_count' && payload.rate_limits) {
    reportCodex(payload.rate_limits, at)
  }
  if (entry.type === 'event_msg' && payload.type === 'token_count' && payload.info) {
    const total = payload.info.total_token_usage ?? {}
    const last = payload.info.last_token_usage ?? {}
    const cached = total.cached_input_tokens ?? 0
    w.usage = {
      input: Math.max(0, (total.input_tokens ?? 0) - cached),
      output: total.output_tokens ?? 0,
      cacheRead: cached,
      cacheWrite: 0,
      tokens: total.total_tokens ?? (total.input_tokens ?? 0) + (total.output_tokens ?? 0),
      cost: 0,
      context: (last.input_tokens ?? 0) + (last.output_tokens ?? 0),
      window: payload.info.model_context_window ?? 0
    }
  }
  if (entry.type === 'event_msg' && payload.type === 'user_message' && payload.message) {
    addActivity(w, { at, tool: 'Prompt', kind: 'prompt', summary: payload.message, status: 'done' })
  }
  if (entry.type === 'response_item' && payload.type === 'function_call') {
    let args: Entry = {}
    try {
      args = JSON.parse(payload.arguments ?? '{}')
    } catch {
      // Left empty.
    }
    if (payload.name === 'update_plan' && Array.isArray(args.plan)) {
      w.tasks = args.plan.map((step: Entry, i: number) => ({
        id: String(i + 1),
        text: step.step ?? '',
        status: step.status ?? 'pending'
      }))
      return
    }
    // A patch comes as the tool's input, or, from older versions, through the shell.
    const patch =
      payload.name === 'apply_patch'
        ? args.input
        : Array.isArray(args.command) && args.command[0] === 'apply_patch'
          ? args.command[1]
          : null
    for (const f of patchFiles(patch)) claim(w, f, at)
    const command = Array.isArray(args.command) ? args.command.join(' ') : args.command
    const item: NewActivity = {
      at,
      tool: payload.name === 'shell' ? 'Shell' : payload.name,
      kind: payload.name === 'apply_patch' ? 'edit' : 'run',
      summary: firstLine(command ?? args.input ?? JSON.stringify(args)).slice(0, 160),
      status: 'running'
    }
    addActivity(w, item)
    if (payload.call_id) w.pending.set(payload.call_id, item)
  }
  // Newer Codex versions send the patch as a tool of its own, with the patch as its input.
  if (
    entry.type === 'response_item' &&
    payload.type === 'custom_tool_call' &&
    payload.name === 'apply_patch'
  ) {
    for (const f of patchFiles(payload.input)) claim(w, f, at)
  }
  if (entry.type === 'response_item' && payload.type === 'function_call_output') {
    finishTool(w, payload.call_id, false)
  }
}

// --- Reports

function addActivity(w: Watcher, entry: NewActivity): void {
  // On one line, without the tags agents wrap pasted text and commands in.
  const summary = String(entry.summary ?? '')
    .replace(/<\/?[a-z][\w-]*[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  w.activity.push({ id: w.nextActivity++, ...entry, summary })
  if (w.activity.length > MAX_ACTIVITY) w.activity.splice(0, w.activity.length - MAX_ACTIVITY)
}

function report(w: Watcher): AgentReport {
  const u = w.usage
  return {
    workspaceId: w.workspaceId,
    nodeId: w.nodeId,
    agent: w.agent,
    model: w.model,
    title: w.title,
    usage: { ...u, cost: Math.round(u.cost * 10000) / 10000 },
    tasks: w.tasks,
    activity: w.activity.map((a) => ({ ...a })),
    lines: w.lines
  }
}

function flush(): void {
  if (!dirty.size) return
  const reports = [...dirty]
    .map((id) => watchers.get(id))
    .filter((w): w is Watcher => Boolean(w))
    .map(report)
  dirty.clear()
  if (reports.length) broadcast(reports)
}

function broadcast(reports: (AgentReport | RemovedReport)[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('telemetry:update', reports)
  }
}

function firstLine(text: unknown = ''): string {
  return String(text).split('\n')[0]
}

function firstJson(file: string): Entry | null {
  try {
    const fd = openSync(file, 'r')
    const buffer = Buffer.alloc(64 * 1024)
    const n = readSync(fd, buffer, 0, buffer.length, 0)
    closeSync(fd)
    return JSON.parse(buffer.toString('utf8', 0, n).split('\n')[0])
  } catch {
    return null
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
