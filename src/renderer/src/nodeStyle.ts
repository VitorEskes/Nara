import { TERMINAL_THEMES } from './terminalThemes'
import type { NodeStyle } from '../../shared/types'

type Options = Record<string, { label: string }>

// The ways a node can be styled from the side panel: a note's text, and a terminal's look.
// A note saves only the keys (`style: { font: 'serif', size: 'l' }`); anything missing falls back
// to DEFAULTS, so notes saved before styles existed look the same as a fresh one.

export const FONTS: Record<string, { label: string; family: string }> = {
  sans: { label: 'Sans', family: 'var(--font-ui)' },
  serif: { label: 'Serif', family: 'var(--font-display)' },
  mono: { label: 'Mono', family: 'var(--font-mono)' }
}

export const SIZES: Record<string, { label: string; px: number }> = {
  s: { label: 'S', px: 13 },
  m: { label: 'M', px: 15 },
  l: { label: 'L', px: 19 },
  xl: { label: 'XL', px: 24 }
}

// Papers are light or dark (`dark`), and each ink has a version for each (`color` on light paper,
// `light` on dark), so any pair stays readable. The keys stay as they were first saved; the colors
// follow the app's palette.
export const INKS: Record<string, { label: string; color: string; light: string }> = {
  ink: { label: 'Charcoal', color: '#1f1f23', light: '#ededf0' },
  shu: { label: 'Graphite', color: '#55555e', light: '#b4b4bc' },
  ai: { label: 'Forest', color: '#1c7a4f', light: '#6bd3a2' },
  moss: { label: 'Leaf', color: '#23756b', light: '#7fd6c4' },
  umber: { label: 'Olive', color: '#5c6b2e', light: '#bcd27e' },
  slate: { label: 'Slate', color: '#3461a8', light: '#84aef0' }
}

export const PAPERS: Record<string, { label: string; color: string; dark?: boolean }> = {
  graphite: { label: 'Graphite', color: '#1f1f23', dark: true },
  forest: { label: 'Forest', color: '#14231c', dark: true },
  washi: { label: 'Paper', color: '#fbfbf9' },
  sand: { label: 'Cream', color: '#f6edd6' },
  rose: { label: 'Sand', color: '#ebdfc6' },
  mist: { label: 'Fog', color: '#e3e6ea' },
  sage: { label: 'Sage', color: '#dbe8d8' }
}

// An ink as it reads on a paper: dark papers take the light version.
export function inkColor(ink: string, paper: string): string {
  return PAPERS[paper]?.dark ? INKS[ink].light : INKS[ink].color
}

export const ALIGNS: Options = {
  left: { label: 'Align left' },
  center: { label: 'Align center' },
  right: { label: 'Align right' }
}

// A note's style with every key filled in.
export type NoteStyle = {
  font: string
  size: string
  ink: string
  paper: string
  align: string
}

const OPTIONS: Record<keyof NoteStyle, Options> = {
  font: FONTS,
  size: SIZES,
  ink: INKS,
  paper: PAPERS,
  align: ALIGNS
}
const DEFAULTS: NoteStyle = { font: 'sans', size: 'm', ink: 'ink', paper: 'washi', align: 'left' }

// The style with every key filled in, from what the note saved. A key that's missing, or that
// names an option that no longer exists, gets the default.
export function resolveStyle(style: NodeStyle = {}): NoteStyle {
  return Object.fromEntries(
    (Object.entries(DEFAULTS) as [keyof NoteStyle, string][]).map(([key, fallback]) => {
      const value = style[key]
      return [key, value != null && value in OPTIONS[key] ? value : fallback]
    })
  ) as unknown as NoteStyle
}

// A terminal's look is saved the same way (`style: { size: 'l', theme: 'forest' }`): its text
// size, its color scheme (terminalThemes.js), a tone that marks it out on the canvas, the shape of
// its cursor and the icon on its bar.
export const TERMINAL_SIZES: Record<string, { label: string; px: number }> = {
  s: { label: 'S', px: 11 },
  m: { label: 'M', px: 13 },
  l: { label: 'L', px: 15 },
  xl: { label: 'XL', px: 17 }
}

// Tones come from main.css (--tone-*), which has each in a light and a dark version. Roles use
// them too.
export const TONES: Options = {
  green: { label: 'Forest' },
  leaf: { label: 'Leaf' },
  olive: { label: 'Olive' },
  umber: { label: 'Umber' },
  clay: { label: 'Clay' },
  slate: { label: 'Slate' },
  plum: { label: 'Plum' }
}

export const CURSORS: Options = {
  bar: { label: 'Bar' },
  block: { label: 'Block' },
  underline: { label: 'Underline' }
}

// A terminal's look with every key filled in. No tone means none; no icon means the program's own.
export type TerminalLook = {
  size: string
  theme: string
  tone: string | null
  cursor: 'bar' | 'block' | 'underline'
  icon: string | null
}

const TERMINAL_DEFAULTS: TerminalLook = {
  size: 'm',
  theme: 'nara',
  tone: null,
  cursor: 'bar',
  icon: null
}

// The look with every key filled in. No tone means none; no icon means the program's own.
export function terminalLook(style: NodeStyle = {}): TerminalLook {
  const options: Record<string, object> = {
    size: TERMINAL_SIZES,
    theme: TERMINAL_THEMES,
    tone: TONES,
    cursor: CURSORS
  }
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
