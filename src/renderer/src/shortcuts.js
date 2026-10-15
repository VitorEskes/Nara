// The app-wide shortcuts, shown next to their entries in the sidebar. They take Ctrl+Shift: a
// terminal on the canvas reads Ctrl+letter, and the shells use most of those. Settings is the one
// exception, on the Ctrl+, every app uses (`shift: false`), which no shell needs.
export const SHORTCUTS = {
  newWorkspace: { code: 'KeyN', keys: 'Ctrl+Shift+N' },
  overview: { code: 'KeyW', keys: 'Ctrl+Shift+W' },
  newProject: { code: 'KeyO', keys: 'Ctrl+Shift+O' },
  sidebar: { code: 'KeyB', keys: 'Ctrl+Shift+B' },
  theme: { code: 'KeyL', keys: 'Ctrl+Shift+L' },
  settings: { code: 'Comma', keys: 'Ctrl+,', shift: false }
}

// Switches a workspace between its canvas and its code. Not in SHORTCUTS: the workspace on screen
// takes it (Workspace.jsx), not the app.
export const CODE_TOGGLE = { code: 'KeyE', keys: 'Ctrl+Shift+E' }
// Switches to the review of the agents' changes and back; G as in VS Code's source control.
export const REVIEW_TOGGLE = { code: 'KeyG', keys: 'Ctrl+Shift+G' }

// The name of the shortcut matching a keydown, if any.
export function shortcutFor(e) {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null
  const found = Object.keys(SHORTCUTS).find(
    (name) => SHORTCUTS[name].code === e.code && (SHORTCUTS[name].shift ?? true) === e.shiftKey
  )
  return found ?? null
}

// The short form shown in the sidebar: "⌃⇧N", "⌃,".
export function keysLabel(shortcut) {
  return shortcut.keys.replace('Ctrl+Shift+', '⌃⇧').replace('Ctrl+', '⌃')
}

// The canvas tools and actions on single keys, as in drawing apps. They only apply while nothing
// that takes text has the keyboard: a terminal, a note or a rename field.
export const CANVAS_KEYS = {
  v: 'select',
  h: 'hand',
  d: 'draw',
  e: 'erase',
  w: 'text',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  c: 'link',
  t: 'terminal',
  n: 'note',
  b: 'browser',
  m: 'minimap',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  0: 'zoomReset',
  1: 'zoomFit',
  '?': 'shortcuts'
}

export function canvasKeyFor(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  if (e.target.closest?.('input, textarea, select, [contenteditable], .xterm')) return null
  // Shift is allowed so "+" works on layouts where it needs it, and Shift+1 / Shift+0 match
  // Figma; the digit comes from e.code, since Shift+1 reads as "!".
  const digit = e.code?.startsWith('Digit') ? e.code.slice(5) : null
  return CANVAS_KEYS[digit ?? e.key.toLowerCase()] ?? null
}
