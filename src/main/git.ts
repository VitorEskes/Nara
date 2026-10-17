import { app, ipcMain, type BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
import { changedBy, topOf } from './changes'
import type { ChangesOwner, GitChange, MergeResult, Worktree } from '../shared/types'

// Git for the canvas: a worktree of its own for an agent, so agents working side by side never
// edit the same checkout, and the changes in a node's folder, for the inspector to review. Every
// command runs git itself with its arguments as a list, never through a shell.
const MAX_DIFF = 400 * 1024

export function registerGit(win: BrowserWindow): void {
  // A new worktree of the repository `folder` is in, on a new branch off what's checked out there.
  // Worktrees live in Nara's data folder, one folder per repository. Returns { path, branch,
  // base, root } or { error }.
  ipcMain.handle('git:worktree', async (_ev, folder: string, name?: string) => {
    try {
      const root = (await git(folder, ['rev-parse', '--show-toplevel'])).trim()
      const base = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const slug = `${slugify(name) || 'agent'}-${randomBytes(2).toString('hex')}`
      const branch = `nara/${slug}`
      const hash = createHash('sha1').update(root).digest('hex').slice(0, 6)
      const parent = join(app.getPath('userData'), 'worktrees', `${basename(root)}-${hash}`)
      mkdirSync(parent, { recursive: true })
      const path = join(parent, slug)
      await git(root, ['worktree', 'add', '-b', branch, path, 'HEAD'])
      return { path, branch, base, root }
    } catch (error) {
      return { error: firstLine((error as Error).message) }
    }
  })

  // What changed in the folder against its last commit: { branch, files: [{ path, status, added,
  // removed }] }, or null outside a repository. With `owner`, only the files that node's terminal
  // changed (changes.ts), and `others` says how many more there are.
  ipcMain.handle('git:changes', async (_ev, folder?: string, owner?: ChangesOwner) => {
    if (!folder || !existsSync(folder)) return null
    try {
      const branch = (await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const status = await git(folder, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      const numstat = await git(folder, ['diff', 'HEAD', '--numstat', '-z']).catch(() => '')
      const counts = parseNumstat(numstat)
      let files: GitChange[] = parseStatus(status).map((file) => ({
        ...file,
        ...(counts.get(file.path) ?? { added: null, removed: null })
      }))
      if (!owner) return { branch, files }
      const top = await topOf(folder)
      if (!top) return { branch, files }
      const all = files.length
      const mine = changedBy(
        owner.workspaceId,
        owner.nodeId,
        top,
        files.map((f) => f.path)
      )
      files = files.filter((f) => mine.has(f.path))
      return { branch, files, others: all - files.length }
    } catch {
      return null
    }
  })

  // One file's diff against the last commit, untracked files included.
  ipcMain.handle('git:diff', async (_ev, folder: string, file: string, untracked: boolean) => {
    try {
      const args = untracked
        ? ['diff', '--no-index', '--', '/dev/null', file]
        : ['diff', 'HEAD', '--', file]
      const text = await git(folder, args, { allowDiff: true })
      return text.length > MAX_DIFF
        ? `${text.slice(0, MAX_DIFF)}\n… (cut: the diff is too long)`
        : text
    } catch (error) {
      return `Couldn't read the diff: ${firstLine((error as Error).message)}`
    }
  })

  // Merges a worktree's branch into the branch it came from, in the main checkout (the renderer
  // has asked the user). A merge that conflicts is undone and reported. Returns { ok } or
  // { error }.
  ipcMain.handle('git:merge', async (_ev, worktree?: Partial<Worktree>) => {
    const result = await mergeWorktree(worktree)
    if (!result.conflict) return result
    return { error: `It conflicts, so it was undone: ${result.conflict.join(', ')}` }
  })

  // Removes a worktree and its folder (the renderer has asked the user); the branch stays, with
  // its commits.
  ipcMain.handle('git:remove-worktree', async (_ev, worktree?: Partial<Worktree>) => {
    const { root, path } = worktree ?? {}
    if (!root || !path) return { error: 'This terminal has no worktree' }
    try {
      await git(root, ['worktree', 'remove', '--force', path])
      return { ok: true }
    } catch (error) {
      return { error: firstLine((error as Error).message) }
    }
  })

  win.on('closed', () => {
    for (const name of [
      'git:worktree',
      'git:changes',
      'git:diff',
      'git:merge',
      'git:remove-worktree'
    ]) {
      ipcMain.removeHandler(name)
    }
  })
}

// Merges a worktree's branch into the branch it was made from, in the checkout it was made from:
// only what's committed. A merge that conflicts is undone, and the files it conflicted on are
// returned. The inspector's merge button and `nara merge` (main/messages.ts) both use it.
export async function mergeWorktree(worktree?: Partial<Worktree> | null): Promise<MergeResult> {
  const { root, branch, base } = worktree ?? {}
  if (!root || !branch) return { error: 'This terminal has no worktree' }
  try {
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
}

// `git diff --no-index` exits 1 when the files differ, which here is the normal case.
export function git(cwd: string, args: string[], { allowDiff = false } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) => {
        if (error && !(allowDiff && error.code === 1)) {
          reject(new Error(String(stderr || error.message).trim()))
        } else resolve(stdout)
      }
    )
  })
}

// `git status --porcelain -z`: "XY path\0", with renames followed by their old path.
function parseStatus(text: string): Pick<GitChange, 'path' | 'status'>[] {
  const parts = text.split('\0').filter(Boolean)
  const files: Pick<GitChange, 'path' | 'status'>[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++
    files.push({ path, status: statusOf(code) })
  }
  return files
}

function statusOf(code: string): GitChange['status'] {
  if (code === '??') return 'added'
  if (code.includes('D')) return 'deleted'
  if (code.includes('A')) return 'added'
  if (code.includes('R')) return 'renamed'
  if (code.includes('U')) return 'conflict'
  return 'modified'
}

// `git diff --numstat -z`: "added\tremoved\tpath\0" ("-" for binary files).
function parseNumstat(text: string): Map<string, Pick<GitChange, 'added' | 'removed'>> {
  const counts = new Map<string, Pick<GitChange, 'added' | 'removed'>>()
  for (const line of text.split('\0')) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (!match) continue
    counts.set(match[3], {
      added: match[1] === '-' ? null : Number(match[1]),
      removed: match[2] === '-' ? null : Number(match[2])
    })
  }
  return counts
}

function slugify(text: unknown = ''): string {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function firstLine(text: unknown = ''): string {
  return (
    String(text)
      .split('\n')
      .find((l) => l.trim()) ?? ''
  )
}
