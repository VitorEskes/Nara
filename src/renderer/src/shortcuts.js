// The app-wide shortcuts, shown next to their entries in the sidebar. All of them take Ctrl+Shift:
// a terminal on the canvas reads Ctrl+letter, and the shells use most of those.
export const SHORTCUTS = {
  newWorkspace: { code: 'KeyN', keys: 'Ctrl+Shift+N' },
  overview: { code: 'KeyW', keys: 'Ctrl+Shift+W' },
  newProject: { code: 'KeyO', keys: 'Ctrl+Shift+O' },
  sidebar: { code: 'KeyB', keys: 'Ctrl+Shift+B' },
  theme: { code: 'KeyL', keys: 'Ctrl+Shift+L' }
}

// The name of the shortcut matching a keydown, if any.
export function shortcutFor(e) {
  if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return null
  return Object.keys(SHORTCUTS).find((name) => SHORTCUTS[name].code === e.code) ?? null
}

// The short form shown in the sidebar: "⌃⇧N".
export function keysLabel(shortcut) {
  return shortcut.keys.replace('Ctrl+Shift+', '⌃⇧')
}

// The canvas tools and actions on single keys, as in drawing apps. They only apply while nothing
// that takes text has the keyboard: a terminal, a note or a rename field.
export const CANVAS_KEYS = {
  v: 'select',
  h: 'hand',
  d: 'draw',
  e: 'erase',
  t: 'terminal',
  n: 'note',
  m: 'minimap',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  0: 'zoomReset',
  1: 'zoomFit'
}

export function canvasKeyFor(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  if (e.target.closest?.('input, textarea, select, [contenteditable], .xterm')) return null
  // Shift is allowed so "+" works on layouts where it needs it, and Shift+1 / Shift+0 match
  // Figma; the digit comes from e.code, since Shift+1 reads as "!".
  const digit = e.code?.startsWith('Digit') ? e.code.slice(5) : null
  return CANVAS_KEYS[digit ?? e.key.toLowerCase()] ?? null
}
