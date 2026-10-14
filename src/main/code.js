import { ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync, realpathSync, watch } from 'fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { reviewFolders } from './review'
import { workspaces } from './workspaces'

// The files of a workspace for the code view: the tree of a folder, reading and writing a file,
// creating, renaming and trashing, and word when a file that's open changes on disk (an agent
// edited it). Every path is absolute, and every call checks it's inside one of the workspace's
// folders: its own, or one of its agents' worktrees.
const MAX_FILE = 5 * 1024 * 1024
// A folder walked by hand (outside git) stops after this many files.
const MAX_LIST = 20000
// Skipped when walking a folder that isn't a repository; in one, git's ignore rules decide.
const SKIP = new Set(['node_modules', '.git', '.hg', '.svn', '.cache', '.next', 'dist', 'out'])
// Changes to a file come in bursts (a write is often several events); this waits for them to settle.
const SETTLE = 120

const HANDLERS = [
  'code:list',
  'code:read',
  'code:write',
  'code:create',
  'code:rename',
  'code:trash',
  'code:reveal'
]

export function registerCode(win) {
  // The files in `root` as paths relative to it, with their git status where there is one:
  // { files, status: { [path]: 'M' | 'A' | 'D' | 'U' | 'R' }, repo, truncated }.
  ipcMain.handle('code:list', async (_ev, id, root) => {
    if (!allowed(id, root)) return { error: 'outside' }
    try {
      return await listGit(root)
    } catch {
      return listWalk(root)
    }
  })

  // { text, mtime } or { error }: 'missing', 'binary', 'large', 'outside' or a message.
  ipcMain.handle('code:read', async (_ev, id, path) => {
    if (!allowed(id, path)) return { error: 'outside' }
    try {
      const info = await stat(path)
      if (!info.isFile()) return { error: 'not a file' }
      if (info.size > MAX_FILE) return { error: 'large' }
      const bytes = await readFile(path)
      if (looksBinary(bytes)) return { error: 'binary' }
      return { text: bytes.toString('utf8'), mtime: info.mtimeMs }
    } catch (error) {
      return { error: error.code === 'ENOENT' ? 'missing' : error.message }
    }
  })

  // Writes the file unless it changed on disk since `mtime` (when the editor last read or wrote
  // it): then { conflict: true } and nothing is written. `mtime` null writes regardless.
  // Returns { mtime } or { error }. Written in place, so the file keeps its mode and inode.
  ipcMain.handle('code:write', async (_ev, id, path, text, mtime) => {
    if (!allowed(id, path)) return { error: 'outside' }
    try {
      if (mtime != null) {
        const current = await stat(path).catch(() => null)
        if (current && current.mtimeMs !== mtime) return { conflict: true }
      }
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text)
      return { mtime: (await stat(path)).mtimeMs }
    } catch (error) {
      return { error: error.message }
    }
  })

  // A new empty file or folder; never over something that's there. { ok } or { error }.
  ipcMain.handle('code:create', async (_ev, id, path, kind) => {
    if (!allowed(id, path)) return { error: 'outside' }
    if (existsSync(path)) return { error: `${basename(path)} already exists` }
    try {
      if (kind === 'folder') {
        await mkdir(path, { recursive: true })
      } else {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, '', { flag: 'wx' })
      }
      return { ok: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('code:rename', async (_ev, id, from, to) => {
    if (!allowed(id, from) || !allowed(id, to)) return { error: 'outside' }
    if (existsSync(to)) return { error: `${basename(to)} already exists` }
    try {
      await mkdir(dirname(to), { recursive: true })
      await rename(from, to)
      return { ok: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  // To the system's trash, not deleted: a slip of the Delete key can be undone.
  ipcMain.handle('code:trash', async (_ev, id, path) => {
    if (!allowed(id, path)) return { error: 'outside' }
    try {
      await shell.trashItem(path)
      return { ok: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('code:reveal', (_ev, id, path) => {
    if (allowed(id, path)) shell.showItemInFolder(path)
  })

  // The files open in the editor, all workspaces together. Each one's folder is watched (not the
  // file itself: editors and agents often save by writing a new file and renaming it over the
  // old one, which a watch on the file would lose).
  const files = new Set()
  const folders = new Map()
  const timers = new Map()
  ipcMain.on('code:watch', (_ev, paths) => {
    files.clear()
    for (const path of paths) files.add(resolve(path))
    const wanted = new Set([...files].map((file) => dirname(file)))
    for (const [folder, watcher] of folders) {
      if (wanted.has(folder)) continue
      watcher.close()
      folders.delete(folder)
    }
    for (const folder of wanted) {
      if (folders.has(folder)) continue
      try {
        const watcher = watch(folder, (_event, name) => name && changed(join(folder, name)))
        watcher.on('error', () => {
          watcher.close()
          folders.delete(folder)
        })
        folders.set(folder, watcher)
      } catch {
        // The folder is gone: the file will show as missing when the editor next reads it.
      }
    }
  })

  function changed(path) {
    if (!files.has(path)) return
    clearTimeout(timers.get(path))
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path)
        if (!win.isDestroyed()) win.webContents.send('code:changed', path)
      }, SETTLE)
    )
  }

  win.on('closed', () => {
    for (const watcher of folders.values()) watcher.close()
    folders.clear()
    for (const timer of timers.values()) clearTimeout(timer)
    for (const name of HANDLERS) ipcMain.removeHandler(name)
    ipcMain.removeAllListeners('code:watch')
  })
}

// Whether `path` is inside one of the workspace's folders: its own, its agents' worktrees, or a
// repository the review view is going through (review.js). Checked on the real path of the file
// or of its closest folder that exists, so a symlink can't lead out.
function allowed(id, path) {
  const workspace = workspaces.get(id)
  if (!workspace || typeof path !== 'string' || !path) return false
  const roots = [
    workspace.folder,
    ...workspace.nodes.map((node) => node.worktree?.path),
    ...reviewFolders(id)
  ]
    .filter(Boolean)
    .map(real)
  const target = real(resolve(path))
  return roots.some((root) => target === root || target.startsWith(root + sep))
}

function real(path) {
  let existing = path
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
  try {
    return join(realpathSync(existing), relative(existing, path))
  } catch {
    return path
  }
}

// In a repository: what git tracks plus what it doesn't ignore, minus what was deleted, with each
// file's status. Paths from git status are relative to the repository's top; `prefix` is where
// `root` sits in it.
async function listGit(root) {
  const prefix = (await git(root, ['rev-parse', '--show-prefix'])).trim()
  const [all, deleted, status] = await Promise.all([
    git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']),
    git(root, ['ls-files', '-z', '--deleted']),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
  ])
  const gone = new Set(split(deleted))
  const files = [...new Set(split(all))].filter((file) => !gone.has(file))
  return { files, status: parseStatus(status, prefix), repo: true, truncated: false }
}

async function listWalk(root) {
  const files = []
  const queue = ['']
  while (queue.length && files.length < MAX_LIST) {
    const folder = queue.shift()
    let entries
    try {
      entries = await readdir(join(root, folder), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = folder ? `${folder}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) queue.push(path)
      } else {
        files.push(path)
      }
    }
  }
  return { files, status: {}, repo: false, truncated: files.length >= MAX_LIST }
}

// porcelain v1 with -z: "XY path\0", and for renames "XY new\0old\0". One letter per file, the
// way the explorer shows it.
function parseStatus(text, prefix) {
  const status = {}
  const parts = text.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++
    if (!path.startsWith(prefix)) continue
    const letter =
      code === '??'
        ? 'U'
        : code.includes('U')
          ? 'C'
          : code.includes('D')
            ? 'D'
            : code.includes('A')
              ? 'A'
              : code.includes('R')
                ? 'R'
                : 'M'
    status[path.slice(prefix.length)] = letter
  }
  return status
}

function split(text) {
  return text.split('\0').filter(Boolean)
}

// A NUL in the first few KB is what git takes for binary too.
function looksBinary(bytes) {
  return bytes.subarray(0, 8000).includes(0)
}

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout)
    )
  })
}
