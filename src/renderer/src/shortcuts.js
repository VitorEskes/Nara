// The app-wide shortcuts, shown next to their entries in the sidebar. All of them take Ctrl+Shift:
// a terminal on the canvas reads Ctrl+letter, and the shells use most of those.
export const SHORTCUTS = {
  newWorkspace: { code: 'KeyN', keys: 'Ctrl+Shift+N' },
  overview: { code: 'KeyW', keys: 'Ctrl+Shift+W' },
  newProject: { code: 'KeyO', keys: 'Ctrl+Shift+O' }
}

// The name of the shortcut matching a keydown, if any.
export function shortcutFor(e) {
  if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return null
  return Object.keys(SHORTCUTS).find((name) => SHORTCUTS[name].code === e.code) ?? null
}
