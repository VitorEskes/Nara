import { useEffect, useRef } from 'react'

// A sticky note: plain text that lives in the node and is saved with the workspace.
// Unlike xterm, a textarea handles the canvas zoom by itself: the browser maps clicks and the
// caret through the CSS transform.
export default function Note({ text, onChange }) {
  const textarea = useRef(null)

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
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
