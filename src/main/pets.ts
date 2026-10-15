import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, dirname, extname, join, resolve, sep } from 'path'
import { promisify } from 'util'
import { readJson } from './files'
import type { PetInfo } from '../shared/types'

type Source = 'nara' | 'codex'

// The pets the user can pick for the canvas, besides the built-in one. A pet is a folder with a
// pet.json ({ displayName, description, spritesheetPath }) and its sprite sheet, the format of
// Codex's pets, so the ones made for Codex work here as they are. Nara reads two folders: its own
// (pets in the app's data folder), where the user adds pets by hand, and Codex's, which it only
// ever reads.
const SOURCES: Record<Source, { label: string; folder: () => string }> = {
  nara: { label: 'Nara', folder: () => join(app.getPath('userData'), 'pets') },
  codex: {
    label: 'Codex',
    folder: () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'pets')
  }
}

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png' }

export function registerPets(win: BrowserWindow): void {
  // Every pet found, as { id, name, description, source }. The id is "<source>:<folder>".
  ipcMain.handle('pets:list', () =>
    (Object.entries(SOURCES) as [Source, (typeof SOURCES)[Source]][]).flatMap(
      ([source, { label, folder }]) =>
        folders(folder()).flatMap((name): PetInfo[] => {
          const pet = readPet(source, name)
          return pet
            ? [
                {
                  id: `${source}:${name}`,
                  name: pet.name,
                  description: pet.description,
                  source: label
                }
              ]
            : []
        })
    )
  )

  // The pet's sprite sheet as a data URL, which the renderer can draw whatever page it was
  // loaded from.
  ipcMain.handle('pets:sprite', (_ev, id: string) => {
    const text = String(id)
    const source = text.slice(0, text.indexOf(':')) as Source
    const name = text.slice(text.indexOf(':') + 1)
    const pet = Object.hasOwn(SOURCES, source) && readPet(source, name)
    if (!pet) return null
    try {
      const data = readFileSync(pet.sprite).toString('base64')
      return `data:${TYPES[extname(pet.sprite).toLowerCase()]};base64,${data}`
    } catch {
      return null
    }
  })

  // Nara's folder is made on the way; Codex's is only opened if it's there.
  ipcMain.handle('pets:open', (_ev, source: Source) => {
    if (!Object.hasOwn(SOURCES, source)) return false
    const folder = SOURCES[source].folder()
    if (source === 'nara') mkdirSync(folder, { recursive: true })
    else if (!isFolder(folder)) return false
    shell.openPath(folder)
    return true
  })

  ipcMain.handle('pets:folders', () =>
    Object.fromEntries(
      Object.entries(SOURCES).map(([source, { folder }]) => [source, isFolder(folder())])
    )
  )

  // Adds a pet made for Codex: the user picks its pet.json, or the .zip it came in, and the folder
  // is copied into Nara's. Returns { id } of the pet added, { error } if it isn't a pet, or null
  // if the picker was canceled.
  ipcMain.handle('pets:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Add a pet',
      buttonLabel: 'Add pet',
      filters: [{ name: 'Codex pet (pet.json or .zip)', extensions: ['json', 'zip'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    const file = filePaths[0]
    let unpacked = null
    try {
      let source: string | null = dirname(file)
      if (extname(file).toLowerCase() === '.zip') {
        unpacked = mkdtempSync(join(tmpdir(), 'nara-pet-'))
        await unzip(file, unpacked)
        source = findPet(unpacked)
        if (!source) return { error: 'There’s no pet.json in that .zip' }
      }
      return importPet(source)
    } catch (error) {
      return { error: `Couldn’t add the pet: ${(error as Error).message}` }
    } finally {
      if (unpacked) rmSync(unpacked, { recursive: true, force: true })
    }
  })

  win.on('closed', () => {
    for (const name of ['pets:list', 'pets:sprite', 'pets:open', 'pets:folders', 'pets:import']) {
      ipcMain.removeHandler(name)
    }
  })
}

// { name, description, sprite } for a pet folder, or null if it isn't a usable pet. The sprite
// sheet has to be a PNG or WebP inside the pet's own folder.
function readPet(
  source: Source,
  name: string
): { name: string; description: string; sprite: string } | null {
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return null
  const dir = join(SOURCES[source].folder(), name)
  const manifest = readJson(join(dir, 'pet.json'))
  if (!manifest) return null
  const sprite = resolve(dir, String(manifest.spritesheetPath || 'spritesheet.webp'))
  if (!sprite.startsWith(dir + sep) || !TYPES[extname(sprite).toLowerCase()]) return null
  if (!isFile(sprite)) return null
  return {
    name: String(manifest.displayName || manifest.id || name).slice(0, 40),
    description: typeof manifest.description === 'string' ? manifest.description.slice(0, 160) : '',
    sprite
  }
}

// Copies a pet folder into Nara's under a name of its own: the pet's id, or its folder's, made
// safe for a folder name, with a number after it if that's taken.
function importPet(source: string): { id: string } | { error: string } {
  const manifest = readJson(join(source, 'pet.json'))
  if (!manifest) return { error: 'That pet.json can’t be read' }
  const sprite = resolve(source, String(manifest.spritesheetPath || 'spritesheet.webp'))
  if (
    !sprite.startsWith(source + sep) ||
    !TYPES[extname(sprite).toLowerCase()] ||
    !isFile(sprite)
  ) {
    return { error: 'The pet’s sprite sheet is missing, or isn’t a PNG or WebP' }
  }
  const root = SOURCES.nara.folder()
  mkdirSync(root, { recursive: true })
  const base =
    String(manifest.id || basename(source))
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^[-.]+|-+$/g, '') || 'pet'
  let name = base
  for (let n = 2; existsSync(join(root, name)); n++) name = `${base}-${n}`
  cpSync(source, join(root, name), { recursive: true })
  return { id: `nara:${name}` }
}

// The folder with the pet.json in an unpacked .zip: its top, or a folder one level down (a .zip
// of the pet's folder).
function findPet(dir: string): string | null {
  if (isFile(join(dir, 'pet.json'))) return dir
  return (
    folders(dir)
      .map((name) => join(dir, name))
      .find((sub) => isFile(join(sub, 'pet.json'))) ?? null
  )
}

// unzip where there is one (Linux, macOS); Windows and macOS also read .zip files with tar.
async function unzip(file: string, into: string): Promise<void> {
  const run = promisify(execFile)
  try {
    await run('unzip', ['-q', '-o', file, '-d', into])
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await run('tar', ['-xf', file, '-C', into])
  }
}

function folders(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => isFolder(join(dir, name)))
  } catch {
    return []
  }
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
