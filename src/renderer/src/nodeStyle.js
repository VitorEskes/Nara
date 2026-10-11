import { TERMINAL_THEMES } from './terminalThemes'

// The ways a node can be styled from the side panel: a note's text, and a terminal's look.
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

// Papers are light or dark (`dark`), and each ink has a version for each (`color` on light paper,
// `light` on dark), so any pair stays readable. The keys stay as they were first saved; the colors
// follow the app's palette.
export const INKS = {
  ink: { label: 'Charcoal', color: '#1f1f23', light: '#ededf0' },
  shu: { label: 'Graphite', color: '#55555e', light: '#b4b4bc' },
  ai: { label: 'Forest', color: '#1c7a4f', light: '#6bd3a2' },
  moss: { label: 'Leaf', color: '#23756b', light: '#7fd6c4' },
  umber: { label: 'Olive', color: '#5c6b2e', light: '#bcd27e' },
  slate: { label: 'Slate', color: '#3461a8', light: '#84aef0' }
}

export const PAPERS = {
  graphite: { label: 'Graphite', color: '#1f1f23', dark: true },
  forest: { label: 'Forest', color: '#14231c', dark: true },
  washi: { label: 'Paper', color: '#fbfbf9' },
  sand: { label: 'Cream', color: '#f6edd6' },
  rose: { label: 'Sand', color: '#ebdfc6' },
  mist: { label: 'Fog', color: '#e3e6ea' },
  sage: { label: 'Sage', color: '#dbe8d8' }
}

// An ink as it reads on a paper: dark papers take the light version.
export function inkColor(ink, paper) {
  return PAPERS[paper]?.dark ? INKS[ink].light : INKS[ink].color
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

// A terminal's look is saved the same way (`style: { size: 'l', theme: 'forest' }`): its text
// size, its color scheme (terminalThemes.js), a tone that marks it out on the canvas, the shape of
// its cursor and the icon on its bar.
export const TERMINAL_SIZES = {
  s: { label: 'S', px: 11 },
  m: { label: 'M', px: 13 },
  l: { label: 'L', px: 15 },
  xl: { label: 'XL', px: 17 }
}

// Tones come from main.css (--tone-*), which has each in a light and a dark version. Roles use
// them too.
export const TONES = {
  green: { label: 'Forest' },
  leaf: { label: 'Leaf' },
  olive: { label: 'Olive' },
  umber: { label: 'Umber' },
  clay: { label: 'Clay' },
  slate: { label: 'Slate' },
  plum: { label: 'Plum' }
}

export const CURSORS = {
  bar: { label: 'Bar' },
  block: { label: 'Block' },
  underline: { label: 'Underline' }
}

const TERMINAL_DEFAULTS = { size: 'm', theme: 'nara', tone: null, cursor: 'bar', icon: null }

// The look with every key filled in. No tone means none; no icon means the program's own.
export function terminalLook(style = {}) {
  const options = { size: TERMINAL_SIZES, theme: TERMINAL_THEMES, tone: TONES, cursor: CURSORS }
  return {
    ...TERMINAL_DEFAULTS,
    ...Object.fromEntries(
      Object.entries(options)
        .filter(([key, values]) => Object.hasOwn(values, style[key] ?? ''))
        .map(([key]) => [key, style[key]])
    ),
    icon: typeof style.icon === 'string' ? style.icon : null
  }
}
