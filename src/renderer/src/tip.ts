// The name and tooltip of a button, with its keyboard shortcut beside the name rather than in
// it: the name is what a screen reader reads (aria-label), the shortcut goes to
// aria-keyshortcuts, and the tooltip (main.css, [data-tip]) shows both on screen. `keys` is how
// the shortcut reads ("V", "Ctrl+Shift+E"); `side` is 'bottom' for a tooltip under the button.
export function tip(
  label: string,
  keys?: string | null,
  side?: 'bottom'
): Record<string, string> {
  return {
    'aria-label': label,
    'data-tip': label,
    ...(keys && { 'data-keys': keys, 'aria-keyshortcuts': ariaKeys(keys) }),
    ...(side && { 'data-tip-side': side })
  }
}

// aria-keyshortcuts names keys as the platform does: "Control+Shift+E", "Delete", "-".
export function ariaKeys(keys: string): string {
  return keys
    .split('+')
    .map((key) => ARIA_NAMES[key] ?? key)
    .join('+')
    .replace(/\+\+$/, '+Plus')
}

const ARIA_NAMES: Record<string, string> = { Ctrl: 'Control', Del: 'Delete', Esc: 'Escape', '−': '-', '⌃': 'Control' }
