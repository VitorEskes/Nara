import { useEffect, useRef } from 'react'
import { FONTS, INKS, SIZES, resolveStyle } from '../nodeStyle'

// A note: plain text that lives in the node and is saved with the workspace. `style` holds the
// font, size, ink and alignment picked in the side panel (the paper color goes on the node).
// Unlike xterm, a textarea handles the canvas zoom by itself: the browser maps clicks and the
// caret through the CSS transform.
export default function Note({ text, style, onChange }) {
  const textarea = useRef(null)
  const { font, size, ink, align } = resolveStyle(style)

  // Same as a terminal: a new note is ready to type into.
  useEffect(() => {
    textarea.current.focus()
  }, [])

  return (
    <textarea
      ref={textarea}
      className="note-text"
      value={text}
      placeholder="Write something…"
      // Electron underlines misspelled words but has no menu to fix them, so it would only be noise.
      spellCheck={false}
      style={{
        fontFamily: FONTS[font].family,
        fontSize: SIZES[size].px,
        color: INKS[ink].color,
        textAlign: align
      }}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
