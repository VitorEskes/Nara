import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { ROLES } from '../shared/roles'
import { roleProfile } from '../shared/prompt'
import { readJson, writeAtomic } from './files'

// The roles the user made, offered next to the built-in ones (shared/roles.js). They belong to the
// user, not to a workspace: they're saved in roles.json and every canvas sees them. Each is
// { key, label, description, instructions, tone, model, mode, access, kickoff } (the last four
// are its settings, shared/prompt.js). The key is made here and never changes, so a role that's
// renamed or rewritten stays on the nodes that use it.
const VERSION = 1
const custom = new Map()

// Lengths a role is cut to: a name fits on a node's bar, the instructions go into the prompt.
const LIMITS = { label: 40, description: 120, instructions: 8000, kickoff: 2000 }

export function registerRoles(win) {
  custom.clear()
  for (const role of readJson(rolesPath())?.roles ?? []) {
    if (role?.key && role.label) custom.set(role.key, role)
  }

  ipcMain.handle('roles:list', () => [...custom.values()])

  // A role without a key is new. Returns the role as saved, or null if it has no name.
  ipcMain.handle('roles:save', (_ev, role = {}) => {
    const label = clean(role.label, LIMITS.label)
    if (!label) return null
    const key = custom.has(role.key) ? role.key : `custom-${randomUUID().slice(0, 8)}`
    const saved = {
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
  ipcMain.handle('roles:remove', (_ev, key) => {
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
export function findRole(key) {
  if (Object.hasOwn(ROLES, key ?? '')) return ROLES[key]
  return custom.get(key)
}

function clean(text, limit) {
  return typeof text === 'string' ? text.trim().slice(0, limit) : ''
}

function save() {
  const json = JSON.stringify({ version: VERSION, roles: [...custom.values()] }, null, 2)
  try {
    writeAtomic(rolesPath(), json)
  } catch (error) {
    console.error(`nara: could not save roles: ${error.message}`)
  }
}

function rolesPath() {
  return join(app.getPath('userData'), 'roles.json')
}
