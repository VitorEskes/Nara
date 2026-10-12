import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon } from './icons'
import { FONTS, SIZES, inkColor, resolveStyle } from '../nodeStyle'
import {
  BLOCK_TYPES,
  LISTS,
  block,
  inline,
  listNumber,
  parse,
  serialize,
  shortcut
} from '../markdown'

// A note: Markdown, edited as blocks (markdown.js). Every block shows formatted, and the one being
// written turns into its text, so the Markdown is there to edit without getting in the way of
// reading. Typing "# ", "- ", "[] ", "> " or "```" at the start of a line turns it into that
// block; "/" on an empty line opens a menu of them. Enter starts the next block (another item in
// a list), Tab nests a list item, and the grip on the left drags a block somewhere else.
//
// `text` is the Markdown, saved with the workspace and shared with the agents linked to the note;
// onChange gets it whenever an edit changes it. `style` holds the font, size, ink, paper and
// alignment picked in the inspector. With `view` 'source' the note shows its Markdown as it is.
// `command` is an edit sent from the inspector ({ seq, type, url?, alt? }): a block to add where
// the caret is, applied once per seq.
export default function Note({ text, style, view, command, onChange }) {
  const { font, size, ink, paper, align } = resolveStyle(style)
  const [blocks, setBlocks] = useState(() => parse(text))
  // The text the blocks stand for. When `text` changes from elsewhere (an agent wrote the note),
  // the blocks are read again from it; an edit made here sets both at once.
  const [source, setSource] = useState(text)
  if (text !== source) {
    setSource(text)
    setBlocks(parse(text))
  }
  // The block being written ({ id, caret }), or null.
  const [focus, setFocus] = useState(() => (text ? null : { id: blocks[0].id, caret: 0 }))
  const focusRef = useRef(focus)
  // The block written in last, where the inspector's blocks go once the note has lost the caret.
  const lastFocused = useRef(null)
  // The blocks as they are now, for edits that land after an await (a pasted image).
  const blocksRef = useRef(blocks)
  useEffect(() => {
    focusRef.current = focus
    if (focus) lastFocused.current = focus.id
    blocksRef.current = blocks
  })
  // The menu of block types opened by "/": { id, query, index }.
  const [menu, setMenu] = useState(null)
  // The block being dragged by its grip, and where it would land.
  const [dragging, setDragging] = useState(null)
  const root = useRef(null)

  function commit(next, nextFocus) {
    const markdown = serialize(next)
    setBlocks(next)
    setSource(markdown)
    if (markdown !== text) onChange(markdown)
    if (nextFocus !== undefined) setFocus(nextFocus)
  }

  function updateBlock(id, change) {
    commit(blocks.map((b) => (b.id === id ? { ...b, ...change } : b)))
  }

  // Adds a block of `type` after the one with the caret (or the last one written in, or at the
  // end); an empty line takes the type instead. An image comes with its { url, alt }.
  function insertBlock(type, extra = {}) {
    const current = blocksRef.current
    const id = focusRef.current?.id ?? lastFocused.current
    let index = current.findIndex((b) => b.id === id)
    if (index < 0) index = current.length - 1
    const here = current[index]
    const empty = !here.text && here.type !== 'image' && here.type !== 'hr'
    const next = [...current]
    if (type === 'image' || type === 'hr') {
      const made =
        type === 'image' ? block('image', extra.alt ?? '', { url: extra.url }) : block('hr')
      next.splice(empty ? index : index + 1, empty ? 1 : 0, made)
      // Writing goes on under it.
      let after = next[next.indexOf(made) + 1]
      if (!after || after.text || after.type !== 'p') {
        after = block()
        next.splice(next.indexOf(made) + 1, 0, after)
      }
      return commit(next, { id: after.id, caret: 0 })
    }
    if (empty) {
      next[index] = {
        ...here,
        type,
        checked: false,
        indent: LISTS.has(type) && LISTS.has(here.type) ? here.indent : 0
      }
      return commit(next, { id: here.id, caret: 0 })
    }
    const fresh = block(type, '', {
      indent: LISTS.has(type) && LISTS.has(here.type) ? here.indent : 0,
      ...(type === 'todo' && { checked: false })
    })
    next.splice(index + 1, 0, fresh)
    commit(next, { id: fresh.id, caret: 0 })
  }

  // The inspector's edit, once.
  const applied = useRef(command?.seq)
  useEffect(() => {
    if (!command || command.seq === applied.current) return
    applied.current = command.seq
    insertBlock(command.type, command)
  })

  // What a keystroke in a block's text does, beyond typing.
  function onKeyDown(e, index) {
    const b = blocks[index]
    const el = e.currentTarget
    const caret = el.selectionStart
    const collapsed = el.selectionStart === el.selectionEnd

    if (menu) {
      const options = menuOptions(menu.query)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setMenu({ ...menu, index: (menu.index + step + options.length) % options.length })
        return
      }
      if (e.key === 'Enter' && options.length) {
        e.preventDefault()
        turnInto(index, options[menu.index].type)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
        return
      }
    }

    const mod = e.ctrlKey || e.metaKey
    if (mod && ['KeyB', 'KeyI', 'KeyE'].includes(e.code)) {
      e.preventDefault()
      const mark = { KeyB: '**', KeyI: '*', KeyE: '`' }[e.code]
      const { selectionStart: from, selectionEnd: to } = el
      const next = b.text.slice(0, from) + mark + b.text.slice(from, to) + mark + b.text.slice(to)
      updateBlock(b.id, { text: next })
      setFocus({ id: b.id, caret: to + mark.length * (from === to ? 1 : 2) })
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (b.type === 'code') {
        // In code Enter is a new line; a blank line at the end leaves the block.
        if (caret === b.text.length && b.text.endsWith('\n')) {
          e.preventDefault()
          const next = [...blocks]
          next[index] = { ...b, text: b.text.slice(0, -1) }
          const fresh = block()
          next.splice(index + 1, 0, fresh)
          commit(next, { id: fresh.id, caret: 0 })
        }
        return
      }
      e.preventDefault()
      // An empty item ends the list.
      if ((LISTS.has(b.type) || b.type === 'quote') && !b.text) {
        if (b.indent > 0) return updateBlock(b.id, { indent: b.indent - 1 })
        return commit(
          blocks.map((other) => (other.id === b.id ? { ...other, type: 'p', indent: 0 } : other)),
          { id: b.id, caret: 0 }
        )
      }
      const continues = LISTS.has(b.type) || b.type === 'quote'
      const fresh = block(continues ? b.type : 'p', b.text.slice(caret), {
        indent: continues ? b.indent : 0,
        ...(b.type === 'todo' && { checked: false })
      })
      const next = [...blocks]
      next[index] = { ...b, text: b.text.slice(0, caret) }
      next.splice(index + 1, 0, fresh)
      commit(next, { id: fresh.id, caret: 0 })
      return
    }

    // An image goes with Backspace once its caption is empty.
    if (b.type === 'image' && e.key === 'Backspace' && caret === 0 && collapsed && !b.text) {
      e.preventDefault()
      const next = blocks.filter((other) => other.id !== b.id)
      const neighbor = next[Math.max(0, index - 1)]
      if (!next.length) next.push(block())
      return commit(next, neighbor ? { id: neighbor.id, caret: neighbor.text.length } : null)
    }

    if (e.key === 'Backspace' && caret === 0 && collapsed) {
      if (b.type !== 'p') {
        e.preventDefault()
        if (LISTS.has(b.type) && b.indent > 0) return updateBlock(b.id, { indent: b.indent - 1 })
        return commit(
          blocks.map((other) => (other.id === b.id ? { ...other, type: 'p', indent: 0 } : other)),
          { id: b.id, caret: 0 }
        )
      }
      if (index === 0) return
      e.preventDefault()
      const prev = blocks[index - 1]
      const next = [...blocks]
      if (prev.type === 'hr') {
        next.splice(index - 1, 1)
        return commit(next, { id: b.id, caret: 0 })
      }
      next[index - 1] = { ...prev, text: prev.text + b.text }
      next.splice(index, 1)
      commit(next, { id: prev.id, caret: prev.text.length })
      return
    }

    if (e.key === 'Delete' && caret === b.text.length && collapsed && index < blocks.length - 1) {
      e.preventDefault()
      const after = blocks[index + 1]
      const next = [...blocks]
      next[index] = { ...b, text: b.text + (after.type === 'hr' ? '' : after.text) }
      next.splice(index + 1, 1)
      commit(next, { id: b.id, caret })
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (LISTS.has(b.type)) {
        const indent = Math.max(0, Math.min(4, b.indent + (e.shiftKey ? -1 : 1)))
        updateBlock(b.id, { indent })
        setFocus({ id: b.id, caret })
      } else if (b.type === 'code' && !e.shiftKey) {
        updateBlock(b.id, { text: `${b.text.slice(0, caret)}  ${b.text.slice(caret)}` })
        setFocus({ id: b.id, caret: caret + 2 })
      }
      return
    }

    // Up from the first line and down from the last move to the blocks around.
    if (e.key === 'ArrowUp' && !b.text.slice(0, caret).includes('\n') && index > 0) {
      e.preventDefault()
      const prev = blocks[index - 1]
      setFocus({ id: prev.id, caret: Math.min(caret, prev.text.length) })
      return
    }
    if (e.key === 'ArrowDown' && !b.text.slice(caret).includes('\n') && index < blocks.length - 1) {
      e.preventDefault()
      const next = blocks[index + 1]
      setFocus({ id: next.id, caret: Math.min(caret, next.text.length) })
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setMenu(null)
      el.blur()
    }
  }

  function onInput(index, value, caret) {
    const b = blocks[index]
    if (b.type !== 'image' && (b.type === 'p' || (b.type !== 'code' && !b.text))) {
      const turned = shortcut(value)
      if (turned && (b.type === 'p' || turned.type !== b.type)) {
        setMenu(null)
        const change =
          turned.type === 'hr'
            ? null
            : { type: turned.type, text: turned.text, checked: turned.checked, indent: b.indent }
        if (!change) {
          // A divider, and a new line to go on writing below it.
          const fresh = block()
          const next = [...blocks]
          next[index] = { ...b, type: 'hr', text: '' }
          next.splice(index + 1, 0, fresh)
          return commit(next, { id: fresh.id, caret: 0 })
        }
        return commit(
          blocks.map((other) => (other.id === b.id ? { ...other, ...change } : other)),
          { id: b.id, caret: change.text.length }
        )
      }
    }
    if (value.startsWith('/') && !value.includes(' ') && b.type !== 'code' && b.type !== 'image') {
      setMenu({ id: b.id, query: value.slice(1), index: 0 })
    } else if (menu) setMenu(null)
    updateBlock(b.id, { text: b.type === 'code' ? value : value.replace(/\n/g, ' ') })
    setFocus({ id: b.id, caret })
  }

  // Pasting several lines outside code makes a block of each.
  function onPaste(e, index) {
    // A pasted image is kept in Nara's data folder and added as a block of its own.
    const image = [...e.clipboardData.files].find((file) => file.type.startsWith('image/'))
    if (image) {
      e.preventDefault()
      image
        .arrayBuffer()
        .then((bytes) => window.api.notes.saveImage(bytes, image.type))
        .then((saved) => saved && insertBlock('image', { url: saved.url, alt: '' }))
      return
    }
    const b = blocks[index]
    const pasted = e.clipboardData.getData('text/plain')
    if (b.type === 'code' || !pasted.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const before = b.text.slice(0, el.selectionStart)
    const after = b.text.slice(el.selectionEnd)
    const parsed = parse(pasted)
    const first = parsed[0]
    // The first pasted line joins the text before the caret; a pasted heading or list item on a
    // line that already has text gets its own block.
    const merged =
      first.type === 'p' || !before
        ? [{ ...b, ...(before ? {} : first), id: b.id, text: before + first.text }]
        : [{ ...b, text: before }, first]
    const rest = parsed.slice(1)
    const last = rest.length ? rest[rest.length - 1] : merged[merged.length - 1]
    const caret = last.text.length
    last.text += after
    const next = [...blocks]
    next.splice(index, 1, ...merged, ...rest)
    commit(next, { id: last.id, caret })
  }

  function turnInto(index, type) {
    const b = blocks[index]
    setMenu(null)
    if (type === 'image') {
      updateBlock(b.id, { text: '' })
      window.api.notes
        .pickImage()
        .then((picked) => picked && insertBlock('image', { url: picked.url, alt: picked.name }))
      return
    }
    if (type === 'hr') {
      const fresh = block()
      const next = [...blocks]
      next[index] = { ...b, type: 'hr', text: '' }
      next.splice(index + 1, 0, fresh)
      return commit(next, { id: fresh.id, caret: 0 })
    }
    commit(
      blocks.map((other) =>
        other.id === b.id ? { ...other, type, text: '', checked: false } : other
      ),
      { id: b.id, caret: 0 }
    )
  }

  // A click below the last block writes on: in it if it's empty text, or in a new one.
  function onBackgroundDown(e) {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const last = blocks[blocks.length - 1]
    if (last.type === 'p' && !last.text) return setFocus({ id: last.id, caret: 0 })
    const fresh = block()
    commit([...blocks, fresh], { id: fresh.id, caret: 0 })
  }

  // Dragging a block by its grip: it lands before the block whose middle the pointer passed.
  function onGripDown(e, index) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    let target = index
    setDragging({ from: index, to: index })
    function onMove(ev) {
      const rows = [...root.current.querySelectorAll(':scope > .md-block')]
      target = rows.length
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect()
        if (ev.clientY < rect.top + rect.height / 2) {
          target = i
          break
        }
      }
      setDragging({ from: index, to: target })
    }
    function onUp() {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      setDragging(null)
      if (target === index || target === index + 1) return
      const next = [...blocks]
      const [moved] = next.splice(index, 1)
      next.splice(target > index ? target - 1 : target, 0, moved)
      commit(next)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  // The Markdown itself, to read or edit as text.
  if (view === 'source') {
    return (
      <textarea
        className="note-text note-source"
        value={text}
        spellCheck={false}
        placeholder="Markdown"
        style={{ color: inkColor(ink, paper) }}
        onChange={(e) => {
          setSource(e.target.value)
          setBlocks(parse(e.target.value))
          onChange(e.target.value)
        }}
      />
    )
  }

  return (
    <div
      ref={root}
      className="note-text md"
      data-align={align}
      style={{
        fontFamily: FONTS[font].family,
        fontSize: SIZES[size].px,
        color: inkColor(ink, paper)
      }}
      onPointerDown={onBackgroundDown}
    >
      {blocks.map((b, index) => (
        <Fragment key={b.id}>
          {dragging?.to === index && dragging.from !== index && <div className="md-drop" />}
          <Block
            block={b}
            index={index}
            number={b.type === 'ol' ? listNumber(blocks, index) : null}
            editing={focus?.id === b.id}
            caret={focus?.id === b.id ? focus.caret : null}
            placeholder={blocks.length === 1 && index === 0}
            dragged={dragging?.from === index}
            onFocus={(caret) => setFocus({ id: b.id, caret })}
            onBlur={(e) => {
              if (root.current?.contains(e.relatedTarget)) return
              if (focusRef.current?.id === b.id) {
                setFocus(null)
                setMenu(null)
              }
            }}
            onKeyDown={(e) => onKeyDown(e, index)}
            onInput={(value, caret) => onInput(index, value, caret)}
            onPaste={(e) => onPaste(e, index)}
            onToggle={() => updateBlock(b.id, { checked: !b.checked })}
            onGripDown={(e) => onGripDown(e, index)}
          />
          {menu?.id === b.id && (
            <SlashMenu
              query={menu.query}
              index={menu.index}
              onPick={(type) => turnInto(index, type)}
            />
          )}
        </Fragment>
      ))}
      {dragging?.to === blocks.length && <div className="md-drop" />}
    </div>
  )
}

function menuOptions(query) {
  const q = query.toLowerCase()
  return Object.entries(BLOCK_TYPES)
    .filter(([type, { label }]) => !q || label.toLowerCase().includes(q) || type.startsWith(q))
    .map(([type, info]) => ({ type, ...info }))
}

function SlashMenu({ query, index, onPick }) {
  const options = menuOptions(query)
  return (
    <div className="md-menu" role="listbox" onPointerDown={(e) => e.preventDefault()}>
      {options.length === 0 && <span className="md-menu-empty">No block called “{query}”</span>}
      {options.map((option, i) => (
        <button
          key={option.type}
          role="option"
          aria-selected={i === index}
          className="md-menu-item"
          onClick={() => onPick(option.type)}
        >
          <span>{option.label}</span>
          <kbd>{option.hint}</kbd>
        </button>
      ))}
    </div>
  )
}

// One block: its grip, its marker (a bullet, a number, a checkbox) and its text, formatted, or as
// Markdown in a text field while it's being written.
function Block({
  block: b,
  number,
  editing,
  caret,
  placeholder,
  dragged,
  onFocus,
  onBlur,
  onKeyDown,
  onInput,
  onPaste,
  onToggle,
  onGripDown
}) {
  const input = useRef(null)

  // The field takes the focus, with the caret where it's asked to be.
  useLayoutEffect(() => {
    if (!editing || !input.current) return
    const el = input.current
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    if (caret != null && el.selectionStart !== caret) el.setSelectionRange(caret, caret)
  }, [editing, caret])

  // The field grows with its text.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  })

  const marker =
    b.type === 'ul' ? (
      <span className="md-bullet" aria-hidden="true" />
    ) : b.type === 'ol' ? (
      <span className="md-number">{number}.</span>
    ) : b.type === 'todo' ? (
      <button
        className="md-check"
        role="checkbox"
        aria-checked={Boolean(b.checked)}
        aria-label={b.checked ? 'Mark as not done' : 'Mark as done'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
      >
        {b.checked && <CheckIcon size={11} />}
      </button>
    ) : null

  return (
    <div
      className="md-block"
      data-type={b.type}
      data-checked={b.checked || undefined}
      data-dragged={dragged || undefined}
      style={{ '--indent': b.indent ?? 0 }}
    >
      <span
        className="md-grip"
        title="Drag to move"
        onPointerDown={onGripDown}
        aria-hidden="true"
      />
      {marker}
      {b.type === 'image' ? (
        <figure className="md-figure">
          <img
            src={b.url}
            alt={b.text}
            draggable={false}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              onFocus(b.text.length)
            }}
          />
          {editing ? (
            <textarea
              ref={input}
              className="md-input md-caption"
              value={b.text}
              rows={1}
              spellCheck={false}
              placeholder="Caption · Backspace removes the image"
              onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              onSelect={(e) => onFocus(e.currentTarget.selectionStart)}
            />
          ) : (
            b.text && <figcaption className="md-caption">{b.text}</figcaption>
          )}
        </figure>
      ) : b.type === 'hr' ? (
        <hr className="md-hr" />
      ) : editing ? (
        <textarea
          ref={input}
          className="md-input"
          value={b.text}
          rows={1}
          spellCheck={false}
          placeholder={
            placeholder
              ? 'Write, or type / for headings, lists, checklists…'
              : placeholderFor(b.type)
          }
          onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={onBlur}
          onSelect={(e) => onFocus(e.currentTarget.selectionStart)}
        />
      ) : (
        <div
          className="md-text"
          onPointerDown={(e) => {
            if (e.button !== 0 || e.target.closest('a')) return
            e.preventDefault()
            onFocus(b.text.length)
          }}
        >
          {b.text ? (
            b.type === 'code' ? (
              <code>{b.text}</code>
            ) : (
              <Inline text={b.text} />
            )
          ) : (
            <span className="md-empty">
              {placeholder ? 'Write, or type / for headings, lists, checklists…' : '​'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function placeholderFor(type) {
  return {
    h1: 'Heading',
    h2: 'Heading',
    h3: 'Heading',
    todo: 'To do',
    quote: 'Quote',
    code: 'Code'
  }[type]
}

function Inline({ text }) {
  return inline(text).map((piece, i) => {
    let node = piece.text
    if (piece.code) node = <code key={i}>{node}</code>
    if (piece.bold) node = <strong key={i}>{node}</strong>
    if (piece.italic) node = <em key={i}>{node}</em>
    if (piece.strike) node = <s key={i}>{node}</s>
    if (piece.href) {
      node = (
        <a key={i} href={piece.href} target="_blank" rel="noreferrer">
          {node}
        </a>
      )
    }
    return typeof node === 'string' ? <Fragment key={i}>{node}</Fragment> : node
  })
}
