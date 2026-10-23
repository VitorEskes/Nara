import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { ROLES } from '../shared/roles'
import { roleProfile } from '../shared/prompt'
import { readJson, writeAtomic } from './files'
import type { Role, SavedRole } from '../shared/types'

// The roles the user made, offered next to the built-in ones (shared/roles.ts). They belong to the
// user, not to a workspace: they're saved in roles.json and every canvas sees them. Each is
// { key, label, description, instructions, tone, model, mode, access, kickoff } (the last four
// are its settings, shared/prompt.ts). The key is made here and never changes, so a role that's
// renamed or rewritten stays on the nodes that use it.
const VERSION = 1
const custom = new Map<string, SavedRole>()

// Lengths a role is cut to: a name fits on a node's bar, the instructions go into the prompt.
const LIMITS = { label: 40, description: 120, instructions: 8000, kickoff: 2000 }

export function registerRoles(win: BrowserWindow): void {
  custom.clear()
  for (const role of readJson(rolesPath())?.roles ?? []) {
    if (role?.key && role.label) custom.set(role.key, role)
  }

  ipcMain.handle('roles:list', () => [...custom.values()])

  // A role without a key is new. Returns the role as saved, or null if it has no name.
  ipcMain.handle('roles:save', (_ev, role: Partial<Role> = {}) => {
    const label = clean(role.label, LIMITS.label)
    if (!label) return null
    const key = role.key && custom.has(role.key) ? role.key : `custom-${randomUUID().slice(0, 8)}`
    const saved: SavedRole = {
      key,
      label,
      description: clean(role.description, LIMITS.description),
      instructions: clean(role.instructions, LIMITS.instructions),
      tone: typeof role.tone === 'string' ? role.tone : undefined,
      ...roleProfile({ ...role, kickoff: clean(role.kickoff, LIMITS.kickoff) })
    }
    custom.set(key, saved)
    save()
    return saved
  })

  // Nodes that had the role keep its key; they open with no role from then on.
  ipcMain.handle('roles:remove', (_ev, key: string) => {
    if (!custom.delete(key)) return false
    save()
    return true
  })

  win.on('closed', () => {
    ipcMain.removeHandler('roles:list')
    ipcMain.removeHandler('roles:save')
    ipcMain.removeHandler('roles:remove')
  })
}

// The role behind a key, built-in or made by the user.
export function findRole(key: string | undefined): Role | undefined {
  if (key === undefined) return undefined
  if (Object.hasOwn(ROLES, key)) return ROLES[key]
  return custom.get(key)
}

// Every role's key and name, built-in first, for an agent naming one (`nara new terminal`).
export function roleNames(): { key: string; label: string }[] {
  const all = [...Object.entries(ROLES), ...custom.entries()]
  return all.map(([key, role]) => ({ key, label: role.label }))
}

// The key of the role an agent named, by its key or by its name in any case; null if none is.
export function roleKey(name: string): string | null {
  const wanted = name.trim().toLowerCase()
  const found = roleNames().find(
    ({ key, label }) => key.toLowerCase() === wanted || label.toLowerCase() === wanted
  )
  return found?.key ?? null
}

function clean(text: unknown, limit: number): string {
  return typeof text === 'string' ? text.trim().slice(0, limit) : ''
}

function save(): void {
  const json = JSON.stringify({ version: VERSION, roles: [...custom.values()] }, null, 2)
  try {
    writeAtomic(rolesPath(), json)
  } catch (error) {
    console.error(`nara: could not save roles: ${(error as Error).message}`)
  }
}

function rolesPath(): string {
  return join(app.getPath('userData'), 'roles.json')
}
