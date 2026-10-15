import type { JSX } from 'react'
import { GlobeIcon, NoteIcon } from './icons'
import { GLYPHS, programIcon } from '../glyphs'

// What a node is: a note, a browser, or a terminal with the icon it picked, or else its program's.
export default function NodeIcon({
  type,
  agent,
  icon,
  size = 14,
  className
}: {
  type: string
  agent?: string | null
  icon?: string | null
  size?: number
  className?: string
}): JSX.Element {
  const glyph = icon && Object.hasOwn(GLYPHS, icon) ? icon : programIcon(agent)
  const Glyph = type === 'note' ? NoteIcon : type === 'browser' ? GlobeIcon : GLYPHS[glyph].Icon
  return <Glyph size={size} className={className} />
}
