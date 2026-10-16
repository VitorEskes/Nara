import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { stat } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { git } from './git'
import type { NodeId } from '../shared/types'

// Which terminal changed which files, so the inspector can show each terminal only its own
// changes. Git knows what changed but not who changed it, so Nara works it out from:
//
// - An agent's edits, read from its session (telemetry.ts). These are exact and win.
// - When each terminal was busy: the shell integration (shell.ts) marks where every command starts
//   and ends (OSC 133 C and D), and an agent node is busy while its agent runs. A file that
//   changed while terminals were busy in its repository goes to each of them.
//
// Repositories are read every few seconds and when a command ends. The result is saved in the data
// folder, and a file is forgotten once it's clean again.

type Key = string

interface Busy {
  key: Key
  top: string | null
  since: number
  until: number | null
}

interface Repo {
  // path from the top -> what it looks like: its status, size and modification time.
  snapshot: Map<string, string> | null
  at: number
  reading: Promise<void> | null
  again: boolean
}

const POLL = 3000
// A busy spell that ended is kept this long, for a read that started before it ended.
const KEEP_ENDED = 60_000
// An agent's edit still takes over a file that changed this long before it was read from the
// agent's session (which is read every 1.5 s).
const CLAIM_WINDOW = 15_000
// The most files a read of a repository looks at.
const MAX_FILES = 2000

// node -> the absolute paths it changed.
const touched = new Map<Key, Set<string>>()
// pty id -> the command running there now.
const running = new Map<number, Busy>()
const ended: Busy[] = []
// top of a repository -> what was last read there.
const repos = new Map<string, Repo>()
// A folder a terminal was in -> the top of its repository, or null outside one.
const tops = new Map<string, Promise<string | null>>()
// A file -> the agent that last said it edited it, and when.
const claims = new Map<string, { key: Key; at: number }>()
// A file -> the busy terminals it went to without a claim, and when, for a claim to take it back.
const guesses = new Map<string, { keys: Key[]; at: number }>()
// pty id -> the start of a mark split across two chunks of output.
const carry = new Map<number, string>()

let timer: ReturnType<typeof setInterval> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined

// eslint-disable-next-line no-control-regex
const MARK = /\x1b\]133;([CD])(?:;nara-cwd=([^\x07\x1b]*))?(?:\x07|\x1b\\)/g

// Once for the app, however many times its window opens.
export function registerChanges(): void {
  if (timer) return
  load()
  timer = setInterval(poll, POLL)
  app.on('will-quit', () => {
    clearInterval(timer)
    if (saveTimer) save()
  })
}

function keyOf(workspaceId: string, nodeId: NodeId): Key {
  return `${workspaceId}:${nodeId}`
}

// A plain terminal's output, for the marks its shell prints around each command.
export function commandOutput(id: number, workspaceId: string, nodeId: NodeId, data: string): void {
  const text = (carry.get(id) ?? '') + data
  carry.delete(id)
  if (!text.includes('\x1b]133;')) return
  for (const [, mark, cwd] of text.matchAll(MARK)) {
    if (mark === 'C') commandStarted(id, workspaceId, nodeId, cwd || undefined)
    else {
      commandEnded(id)
      // At the prompt: the repository is read before the next command, so that command's
      // changes aren't taken for how it was.
      if (cwd) topOf(cwd).then((top) => top && !repos.has(top) && read(top))
    }
  }
  const last = text.lastIndexOf('\x1b]133;')
  const rest = text.slice(last)
  if (!rest.includes('\x07') && !rest.includes('\x1b\\')) carry.set(id, rest.slice(0, 4096))
}

// Something started changing files in the terminal: a command, or an agent node's agent.
export function commandStarted(
  id: number,
  workspaceId: string,
  nodeId: NodeId,
  cwd?: string
): void {
  commandEnded(id)
  const busy: Busy = { key: keyOf(workspaceId, nodeId), top: null, since: Date.now(), until: null }
  running.set(id, busy)
  if (cwd) {
    topOf(cwd).then((top) => {
      busy.top = top
      if (top && !repos.has(top)) read(top)
    })
  }
}

// It's done: the files it changed are read now rather than at the next poll.
export function commandEnded(id: number): void {
  const busy = running.get(id)
  carry.delete(id)
  if (!busy) return
  running.delete(id)
  busy.until = Date.now()
  ended.push(busy)
  if (busy.top) read(busy.top)
}

// An agent said it edited a file (telemetry.ts). `at` is when, by the agent's session.
export function claimEdit(workspaceId: string, nodeId: NodeId, file: string, at: number): void {
  const key = keyOf(workspaceId, nodeId)
  add(key, file)
  claims.set(file, { key, at })
  const guess = guesses.get(file)
  if (guess && at - guess.at < CLAIM_WINDOW) {
    for (const other of guess.keys) if (other !== key) touched.get(other)?.delete(file)
    guesses.delete(file)
  }
  scheduleSave()
}

// Of the files changed in the repository at `top` (paths from the top), the ones the node
// changed. The node's files there that are clean again are forgotten.
export function changedBy(
  workspaceId: string,
  nodeId: NodeId,
  top: string,
  dirty: string[]
): Set<string> {
  const own = touched.get(keyOf(workspaceId, nodeId))
  const mine = new Set<string>()
  if (!own) return mine
  const now = new Set(dirty.map((path) => join(top, path)))
  for (const file of own) {
    if (!file.startsWith(top + '/')) continue
    if (now.has(file)) mine.add(file.slice(top.length + 1))
    else own.delete(file)
  }
  scheduleSave()
  return mine
}

export function topOf(folder: string): Promise<string | null> {
  let top = tops.get(folder)
  if (!top) {
    top = git(folder, ['rev-parse', '--show-toplevel']).then(
      (out) => out.trim() || null,
      () => null
    )
    tops.set(folder, top)
  }
  return top
}

function poll(): void {
  const now = Date.now()
  while (ended.length && (ended[0].until ?? 0) < now - KEEP_ENDED) ended.shift()
  for (const [file, claim] of claims) if (now - claim.at > CLAIM_WINDOW) claims.delete(file)
  for (const [file, guess] of guesses) if (now - guess.at > CLAIM_WINDOW) guesses.delete(file)
  const wanted = new Set<string>()
  for (const busy of running.values()) if (busy.top) wanted.add(busy.top)
  for (const busy of ended) if (busy.top) wanted.add(busy.top)
  // A repository nobody is busy in is still read now and then, so what changes there meanwhile
  // isn't taken for the next command's.
  for (const top of repos.keys()) wanted.add(top)
  for (const top of wanted) read(top)
}

// Reads the repository again and hands what changed since the last read to whoever was busy
// there in between. One read at a time per repository; a read asked for meanwhile runs after.
function read(top: string): void {
  let repo = repos.get(top)
  if (!repo) {
    repo = { snapshot: null, at: 0, reading: null, again: false }
    repos.set(top, repo)
  }
  if (repo.reading) {
    repo.again = true
    return
  }
  const r = repo
  const started = Date.now()
  r.reading = snapshot(top)
    .then((next) => {
      if (!next) {
        repos.delete(top)
        return
      }
      if (r.snapshot) {
        for (const [path, look] of next) {
          if (r.snapshot.get(path) !== look) attribute(join(top, path), top, r.at, started)
        }
      }
      r.snapshot = next
      r.at = started
    })
    .catch(() => {})
    .finally(() => {
      r.reading = null
      if (r.again) {
        r.again = false
        read(top)
      }
    })
}

// A file in `top` changed between `from` and `to`.
function attribute(file: string, top: string, from: number, to: number): void {
  const claim = claims.get(file)
  if (claim && to - claim.at < CLAIM_WINDOW) return
  const keys = new Set<Key>()
  for (const busy of [...running.values(), ...ended]) {
    if (busy.top !== top) continue
    if (busy.since < to && (busy.until === null || busy.until > from)) keys.add(busy.key)
  }
  if (!keys.size) return
  for (const key of keys) add(key, file)
  guesses.set(file, { keys: [...keys], at: to })
  scheduleSave()
}

// path from the top -> its status, size and modification time, for every file git reports as
// changed; null outside a repository.
async function snapshot(top: string): Promise<Map<string, string> | null> {
  if (!existsSync(top)) return null
  const status = await git(top, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const parts = status.split('\0').filter(Boolean)
  const files: [string, string][] = []
  for (let i = 0; i < parts.length && files.length < MAX_FILES; i++) {
    const code = parts[i].slice(0, 2)
    files.push([parts[i].slice(3), code])
    if (code[0] === 'R' || code[0] === 'C') i++
  }
  const looks = await Promise.all(
    files.map(async ([path, code]) => {
      const info = await stat(join(top, path)).catch(() => null)
      return [path, info ? `${code} ${info.size} ${info.mtimeMs}` : code] as [string, string]
    })
  )
  return new Map(looks)
}

function add(key: Key, file: string): void {
  let files = touched.get(key)
  if (!files) touched.set(key, (files = new Set()))
  files.add(file)
}

// Where an agent's edit lands, for a path it gave relative to its folder.
export function editedFile(path: string, cwd?: string): string {
  return isAbsolute(path) || !cwd ? path : resolve(cwd, path)
}

function file(): string {
  return join(app.getPath('userData'), 'changes.json')
}

function load(): void {
  try {
    const saved: Record<Key, string[]> = JSON.parse(readFileSync(file(), 'utf8'))
    for (const [key, files] of Object.entries(saved)) {
      if (Array.isArray(files)) touched.set(key, new Set(files.map(String)))
    }
  } catch {
    // Nothing saved yet.
  }
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(save, 1000)
}

function save(): void {
  saveTimer = undefined
  const out: Record<Key, string[]> = {}
  for (const [key, files] of touched) if (files.size) out[key] = [...files]
  try {
    writeFileSync(file(), JSON.stringify(out))
  } catch (error) {
    console.error(`nara: couldn't save the terminals' changes: ${(error as Error).message}`)
  }
}
