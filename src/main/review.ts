import { ipcMain, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import { isAbsolute, join, normalize, sep } from 'path'
import { firstLine, git } from './git'
import { currentCwd } from './pty'
import { workspaces } from './workspaces'
import { agentIn } from './status'
import type { NodeId, ReviewFile, ReviewItem, Worktree } from '../shared/types'

type Counts = Pick<ReviewFile, 'added' | 'removed' | 'binary'>

// The review queue: what each agent changed, for the review view to go through file by file
// before it's merged or sent back. One item per repository an agent works in (its own worktree,
// or the checkout it shares with the user), diffed against where its work began: the commit its
// worktree branched from, or the last commit of a shared checkout. Every path a call takes is
// checked against the items of the workspace's last queue.
const MAX_TEXT = 5 * 1024 * 1024
// An item lists at most this many files: an agent that unpacked a folder git doesn't ignore
// shouldn't stall the queue.
const MAX_FILES = 1000

const HANDLERS = [
  'review:queue',
  'review:original',
  'review:discard',
  'review:commit',
  'review:merge'
]

// workspace id -> Map(folder -> item), from the last queue.
const known = new Map<string, Map<string, ReviewItem>>()
// A folder an agent is in -> the top of its repository (or null outside one).
const tops = new Map<string, string | null>()

export function registerReview(win: BrowserWindow): void {
  // [{ folder, branch, base, baseCommit, worktree, nodeIds, commits, dirty, files }], each file
  // { path, status: 'M' | 'A' | 'D', added, removed, binary, sig }; `sig` changes whenever the
  // file does, so a file marked as viewed can show it changed since.
  ipcMain.handle('review:queue', (_ev, id: string) => queue(id))

  // The file as it was where the item's work began: { text }, { text: '' } for a file that's new,
  // or { error: 'binary' | 'large' | message }.
  ipcMain.handle(
    'review:original',
    async (_ev, id: string, folder: string, path: string, commit: string) => {
      if (!inside(id, folder, path) || !isCommit(commit)) return { error: 'outside' }
      try {
        const text = await git(folder, ['show', `${commit}:${path}`])
        if (text.length > MAX_TEXT) return { error: 'large' }
        if (text.includes('\0')) return { error: 'binary' }
        return { text }
      } catch {
        return { text: '' }
      }
    }
  )

  // Takes one file back to where the work began: its old text, or gone if it's new. A new file
  // goes to the system's trash rather than being deleted.
  ipcMain.handle(
    'review:discard',
    async (_ev, id: string, folder: string, path: string, commit: string) => {
      if (!inside(id, folder, path) || !isCommit(commit)) return { error: 'outside' }
      try {
        const existed = await git(folder, ['cat-file', '-e', `${commit}:${path}`]).then(
          () => true,
          () => false
        )
        if (existed) {
          await git(folder, ['restore', `--source=${commit}`, '--staged', '--worktree', '--', path])
        } else {
          await git(folder, ['rm', '--cached', '--ignore-unmatch', '-q', '--', path])
          const file = join(folder, path)
          if (existsSync(file)) await shell.trashItem(file)
        }
        return { ok: true }
      } catch (error) {
        return { error: firstLine((error as Error).message) }
      }
    }
  )

  // Commits everything in the item's folder. { ok } or { error }.
  ipcMain.handle('review:commit', async (_ev, id: string, folder: string, message: string) => {
    if (!known.get(id)?.has(folder)) return { error: 'outside' }
    return commitAll(folder, message)
  })

  // Merges a worktree's branch into the branch it came from, in the main checkout, committing
  // what isn't committed yet first when `message` is given. A merge that conflicts is undone:
  // { conflict: [paths] }, for the agent to sort out on its own branch. Else { ok } or { error }.
  ipcMain.handle('review:merge', async (_ev, id: string, folder: string, message?: string) => {
    const item = known.get(id)?.get(folder)
    const { root, branch, base }: Partial<Worktree> = item?.worktree ?? {}
    if (!root || !branch || !base) return { error: 'This change has no worktree to merge' }
    try {
      if ((await git(folder, ['status', '--porcelain'])).trim()) {
        if (!message?.trim()) return { error: 'Commit the changes first' }
        const committed = await commitAll(folder, message)
        if (committed.error) return committed
      }
      const current = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      if (current !== base) return { error: `${root} is on ${current}, not ${base}` }
      try {
        await git(root, ['merge', '--no-ff', '--no-edit', branch])
      } catch (error) {
        const conflicted = await git(root, ['diff', '--name-only', '--diff-filter=U', '-z'])
          .then((text) => text.split('\0').filter(Boolean))
          .catch(() => [])
        await git(root, ['merge', '--abort']).catch(() => {})
        return conflicted.length
          ? { conflict: conflicted }
          : { error: firstLine((error as Error).message) }
      }
      return { ok: true }
    } catch (error) {
      return { error: firstLine((error as Error).message) }
    }
  })

  win.on('closed', () => {
    for (const name of HANDLERS) ipcMain.removeHandler(name)
    known.clear()
  })
}

// The folders the review view reads files in, for the code view's checks (code.js): a shared
// checkout's top can sit above the workspace's folder.
export function reviewFolders(id: string): string[] {
  return [...(known.get(id)?.keys() ?? [])]
}

async function queue(id: string): Promise<ReviewItem[]> {
  const workspace = workspaces.get(id)
  if (!workspace) return []
  // The repositories the workspace's agents are in, each with the agents in it.
  const found = new Map<string, Source>()
  for (const node of workspace.nodes) {
    if (node.type !== 'terminal' || !(node.agent || agentIn(id, node.id))) continue
    const where = node.worktree?.path ?? currentCwd(id, node.id) ?? node.cwd ?? workspace.folder
    const top = where && (await topOf(where))
    if (!top) continue
    const entry: Source = found.get(top) ?? { folder: top, nodeIds: [], worktree: null }
    entry.nodeIds.push(node.id)
    if (node.worktree?.path === top) entry.worktree = node.worktree
    found.set(top, entry)
  }
  const items = (await Promise.all([...found.values()].map(inspect))).filter(
    (item): item is ReviewItem => item !== null
  )
  known.set(id, new Map(items.map((item) => [item.folder, item])))
  return items.filter((item) => item.files.length > 0)
}

// A repository the workspace's agents are in.
interface Source {
  folder: string
  nodeIds: NodeId[]
  worktree: Worktree | null
}

async function inspect({ folder, nodeIds, worktree }: Source): Promise<ReviewItem | null> {
  try {
    const [branch, status] = await Promise.all([
      git(folder, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(folder, ['status', '--porcelain'])
    ])
    // A worktree's work began where it left its base branch; a shared checkout's at its last
    // commit.
    let from = 'HEAD'
    if (worktree?.base) {
      from = await git(folder, ['merge-base', worktree.base, 'HEAD']).then(
        (text) => text.trim(),
        () => 'HEAD'
      )
    }
    const baseCommit = (await git(folder, ['rev-parse', from])).trim()
    const [numstat, names, untracked, log] = await Promise.all([
      git(folder, ['diff', baseCommit, '--numstat', '-z', '--no-renames']),
      git(folder, ['diff', baseCommit, '--name-status', '-z', '--no-renames']),
      git(folder, ['ls-files', '--others', '--exclude-standard', '-z']),
      worktree ? git(folder, ['log', '--format=%h%x09%s', `${baseCommit}..HEAD`]) : ''
    ])

    const counts = parseNumstat(numstat)
    const files = new Map<string, ReviewFile>()
    const parts = names.split('\0').filter(Boolean)
    for (let i = 0; i + 1 < parts.length && files.size < MAX_FILES; i += 2) {
      const letter: ReviewFile['status'] =
        parts[i][0] === 'A' ? 'A' : parts[i][0] === 'D' ? 'D' : 'M'
      const path = parts[i + 1]
      files.set(path, { path, status: letter, ...(counts.get(path) ?? blank()) })
    }
    for (const path of untracked.split('\0').filter(Boolean)) {
      if (files.size >= MAX_FILES) break
      if (!files.has(path))
        files.set(path, { path, status: 'A', ...(await countLines(folder, path)) })
    }
    await Promise.all(
      [...files.values()].map(async (file) => {
        const info = await stat(join(folder, file.path)).catch(() => null)
        file.sig = info ? `${info.size}:${Math.round(info.mtimeMs)}` : 'gone'
      })
    )

    return {
      folder,
      branch: branch.trim(),
      base: worktree?.base ?? null,
      baseCommit,
      worktree,
      nodeIds,
      commits: log
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, ...subject] = line.split('\t')
          return { hash, subject: subject.join('\t') }
        }),
      dirty: Boolean(status.trim()),
      files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
    }
  } catch {
    // Not a repository any more, or one with no commits yet: nothing to review against.
    return null
  }
}

async function commitAll(folder: string, message?: string): Promise<{ ok?: true; error?: string }> {
  if (!message?.trim()) return { error: 'Write a commit message' }
  try {
    await git(folder, ['add', '-A'])
    await git(folder, ['commit', '-q', '-m', message.trim()])
    return { ok: true }
  } catch (error) {
    return { error: firstLine((error as Error).message) }
  }
}

async function topOf(folder: string): Promise<string | null> {
  const cached = tops.get(folder)
  if (cached !== undefined) return cached
  const top = await git(folder, ['rev-parse', '--show-toplevel']).then(
    (text) => normalize(text.trim()),
    () => null
  )
  tops.set(folder, top)
  return top
}

// `path` is relative and stays inside one of the workspace's items.
function inside(id: string, folder: string, path: unknown): boolean {
  if (!known.get(id)?.has(folder) || typeof path !== 'string' || !path) return false
  if (isAbsolute(path)) return false
  const full = normalize(join(folder, path))
  return full.startsWith(folder + sep)
}

function isCommit(commit: unknown): boolean {
  return typeof commit === 'string' && /^[0-9a-f]{40,64}$/.test(commit)
}

function blank(): Counts {
  return { added: null, removed: null, binary: false }
}

// `git diff --numstat -z` without renames: "added\tremoved\tpath\0", "-" for binary files.
function parseNumstat(text: string): Map<string, Counts> {
  const counts = new Map<string, Counts>()
  for (const line of text.split('\0')) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (!match) continue
    const binary = match[1] === '-'
    counts.set(match[3], {
      added: binary ? null : Number(match[1]),
      removed: binary ? null : Number(match[2]),
      binary
    })
  }
  return counts
}

// A new file's lines all count as added.
async function countLines(folder: string, path: string): Promise<Counts> {
  try {
    const file = join(folder, path)
    if ((await stat(file)).size > MAX_TEXT) return blank()
    const bytes = await readFile(file)
    if (bytes.subarray(0, 8000).includes(0)) return { ...blank(), binary: true }
    const text = bytes.toString('utf8')
    const lines = text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0
    return { added: lines, removed: 0, binary: false }
  } catch {
    return blank()
  }
}
