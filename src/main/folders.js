import { dialog, ipcMain } from 'electron'
import { existsSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join, resolve, sep } from 'path'

// Where the folder picker opens when there's no better default: the last folder picked.
let lastFolder = homedir()

export async function pickFolder(win, { title, defaultPath = lastFolder }) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title,
    defaultPath,
    buttonLabel: 'Open here',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths[0]) return null
  lastFolder = filePaths[0]
  return lastFolder
}

// The new terminal dialog picks the folder a single terminal opens in, which leaves the
// workspace's own folder alone, and shows where that is: the path, short, and the git branch.
export function registerFolders(win) {
  ipcMain.handle('folder:pick', (_ev, defaultPath) =>
    pickFolder(win, { title: 'Open the terminal in', defaultPath: defaultPath || lastFolder })
  )
  ipcMain.handle('folder:info', (_ev, path) => folderInfo(path))
  win.on('closed', () => {
    for (const name of ['folder:pick', 'folder:info']) {
      ipcMain.removeHandler(name)
    }
  })
}

// { path, short, exists, branch }: `short` puts ~ for the home folder, and `branch` is the git
// branch checked out there (or the commit, when detached), or null outside a repository. No
// path means the home folder, where a terminal without a folder opens.
function folderInfo(path) {
  const home = homedir()
  const full = path || home
  let exists = false
  try {
    exists = statSync(full).isDirectory()
  } catch {
    // Deleted or never there: the terminal would open in the home folder instead.
  }
  const short =
    full === home ? '~' : full.startsWith(home + sep) ? `~${full.slice(home.length)}` : full
  return { path: full, short, exists, branch: exists ? gitBranch(full) : null }
}

// Reads HEAD from the nearest .git up the tree, without running git. In a worktree or a submodule
// .git is a file that points to the real folder.
function gitBranch(folder) {
  for (let dir = folder; ; dir = dirname(dir)) {
    const dotGit = join(dir, '.git')
    if (existsSync(dotGit)) {
      try {
        let gitDir = dotGit
        if (statSync(dotGit).isFile()) {
          const target = readFileSync(dotGit, 'utf8')
            .match(/^gitdir:\s*(.+)$/m)?.[1]
            .trim()
          if (!target) return null
          gitDir = isAbsolute(target) ? target : resolve(dir, target)
        }
        const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
        return head.match(/^ref: refs\/heads\/(.+)$/)?.[1] ?? head.slice(0, 7)
      } catch {
        return null
      }
    }
    if (dirname(dir) === dir) return null
  }
}
