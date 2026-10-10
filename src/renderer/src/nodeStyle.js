// The ways a node can be styled from the side panel: a note's text, and a terminal's text size.
// A note saves only the keys (`style: { font: 'serif', size: 'l' }`); anything missing falls back
// to DEFAULTS, so notes saved before styles existed look the same as a fresh one.

export const FONTS = {
  sans: { label: 'Sans', family: 'var(--font-ui)' },
  serif: { label: 'Serif', family: 'var(--font-display)' },
  mono: { label: 'Mono', family: 'var(--font-mono)' }
}

export const SIZES = {
  s: { label: 'S', px: 13 },
  m: { label: 'M', px: 15 },
  l: { label: 'L', px: 19 },
  xl: { label: 'XL', px: 24 }
}

// Every paper is light and every ink dark, so any pair stays readable. The keys stay as they were
// first saved; the colors follow the app's palette.
export const INKS = {
  ink: { label: 'Charcoal', color: '#232624' },
  shu: { label: 'Graphite', color: '#5a605b' },
  ai: { label: 'Forest', color: '#24503d' },
  moss: { label: 'Leaf', color: '#2f6a50' },
  umber: { label: 'Olive', color: '#5c6b2e' }
}

export const PAPERS = {
  washi: { label: 'Paper', color: '#fdfbf5' },
  sand: { label: 'Cream', color: '#f1e8d3' },
  rose: { label: 'Sand', color: '#e5d9bd' },
  mist: { label: 'Fog', color: '#dfe2dc' },
  sage: { label: 'Sage', color: '#d6e2cf' }
}

export const ALIGNS = {
  left: { label: 'Align left' },
  center: { label: 'Align center' },
  right: { label: 'Align right' }
}

const OPTIONS = { font: FONTS, size: SIZES, ink: INKS, paper: PAPERS, align: ALIGNS }
const DEFAULTS = { font: 'sans', size: 'm', ink: 'ink', paper: 'washi', align: 'left' }

// The style with every key filled in, from what the note saved. A key that's missing, or that
// names an option that no longer exists, gets the default.
export function resolveStyle(style = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => [
      key,
      style[key] in OPTIONS[key] ? style[key] : fallback
    ])
  )
}

// A terminal only picks its text size, saved the same way (`style: { size: 'l' }`).
export const TERMINAL_SIZES = {
  s: { label: 'S', px: 11 },
  m: { label: 'M', px: 13 },
  l: { label: 'L', px: 15 },
  xl: { label: 'XL', px: 17 }
}

export function terminalSize(style = {}) {
  return style.size in TERMINAL_SIZES ? style.size : 'm'
}
