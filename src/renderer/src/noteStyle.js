// The ways a note's text can be styled from the side panel. A note saves only the keys
// (`style: { font: 'serif', size: 'l' }`); anything missing falls back to DEFAULTS, so notes saved
// before styles existed look the same as a fresh one.

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

// Every paper is light and every ink dark, so any pair stays readable.
export const INKS = {
  ink: { label: 'Ink', color: '#1b1c1f' },
  shu: { label: 'Vermilion', color: '#b8321c' },
  ai: { label: 'Indigo', color: '#3d4f86' },
  moss: { label: 'Moss', color: '#4f6b45' },
  umber: { label: 'Umber', color: '#8a6a3b' }
}

export const PAPERS = {
  washi: { label: 'Washi', color: '#ebe6dc' },
  sand: { label: 'Sand', color: '#e3d6bd' },
  rose: { label: 'Rose', color: '#ecd3ca' },
  mist: { label: 'Mist', color: '#d2d8e8' },
  sage: { label: 'Sage', color: '#d5ddcc' }
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
