import type { JSX } from 'react'
import { Group, Options } from './fields'
import {
  CheckIcon,
  CodeBlockIcon,
  DividerIcon,
  ImageIcon,
  ListChecksIcon,
  ListIcon,
  MarkdownIcon,
  NumberListIcon,
  QuoteIcon,
  TextIcon,
  type IconComponent
} from './icons'
import { ALIGNS, FONTS, INKS, PAPERS, SIZES, inkColor, resolveStyle } from '../nodeStyle'
import type { BlockType } from '../markdown'
import type { CanvasNode, NodeStyle } from '../../../shared/types'

// An edit the side panel sends a note (Note.tsx), applied once: a block to add.
export interface NoteCommand {
  type: BlockType
  url?: string
  alt?: string
}

// What can be added to a note from here, each as the block it makes (markdown.ts).
const BLOCKS: { type: BlockType; label: string; glyph?: string; Icon?: IconComponent }[] = [
  { type: 'h1', label: 'Title', glyph: 'H1' },
  { type: 'h2', label: 'Subtitle', glyph: 'H2' },
  { type: 'h3', label: 'Heading', glyph: 'H3' },
  { type: 'p', label: 'Text', Icon: TextIcon },
  { type: 'ul', label: 'List', Icon: ListIcon },
  { type: 'ol', label: 'Numbered', Icon: NumberListIcon },
  { type: 'todo', label: 'Checklist', Icon: ListChecksIcon },
  { type: 'quote', label: 'Quote', Icon: QuoteIcon },
  { type: 'code', label: 'Code', Icon: CodeBlockIcon },
  { type: 'hr', label: 'Divider', Icon: DividerIcon },
  { type: 'image', label: 'Image', Icon: ImageIcon }
]

const VIEWS = [
  { key: 'rich', label: 'Formatted' },
  { key: 'source', label: 'Markdown' }
]

// The note's Format section: blocks to add where the caret is (or at the end), the note shown
// formatted or as its Markdown, and its look. onCommand sends the note an edit
// ({ type, url? }); the buttons don't take the focus, so the note keeps its caret.
export default function NoteFormat({
  node,
  onChange,
  onCommand
}: {
  node: CanvasNode
  onChange: (changes: Partial<CanvasNode>) => void
  onCommand: (command: NoteCommand) => void
}): JSX.Element {
  const view = node.view === 'source' ? 'source' : 'rich'
  const keep = (e: React.PointerEvent): void => e.preventDefault()

  async function addImage(): Promise<void> {
    const picked = await window.api.notes.pickImage()
    if (picked?.url) onCommand({ type: 'image', url: picked.url, alt: picked.name })
  }

  return (
    <>
      <Group label="View">
        <div
          className="segmented"
          role="group"
          aria-label="View"
          style={{ '--index': VIEWS.findIndex((v) => v.key === view), '--count': VIEWS.length }}
        >
          {VIEWS.map(({ key, label }) => (
            <button key={key} aria-pressed={view === key} onClick={() => onChange({ view: key })}>
              {key === 'source' && <MarkdownIcon size={14} />}
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Add">
        <div className="block-grid">
          {BLOCKS.map(({ type, label, glyph, Icon }) => (
            <button
              key={type}
              className="block-button"
              disabled={view === 'source'}
              title={view === 'source' ? 'Switch to Formatted to add blocks' : undefined}
              onPointerDown={keep}
              onClick={() => (type === 'image' ? addImage() : onCommand({ type }))}
            >
              <span className="block-glyph">{glyph ?? (Icon && <Icon size={15} />)}</span>
              {label}
            </button>
          ))}
        </div>
        <span className="field-hint">
          Adds after the line you’re on. In the note, type / for the same list, or paste an image.
        </span>
      </Group>

      <NoteStyle
        style={node.style}
        onChange={(change) => onChange({ style: { ...node.style, ...change } })}
      />
    </>
  )
}

// A note's font, size, colors and alignment. onChange gets only the key that changed.
function NoteStyle({
  style,
  onChange
}: {
  style?: NodeStyle
  onChange: (change: NodeStyle) => void
}): JSX.Element {
  const current = resolveStyle(style)
  return (
    <>
      <Group label="Font">
        <div className="panel-options">
          {Object.entries(FONTS).map(([key, { label, family }]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              aria-pressed={current.font === key}
              style={{ fontFamily: family }}
              onClick={() => onChange({ font: key })}
            >
              Aa
            </button>
          ))}
        </div>
      </Group>

      <Group label="Size">
        <Options options={SIZES} value={current.size} onPick={(size) => onChange({ size })} />
      </Group>

      <Group label="Paper">
        <div className="panel-swatches">
          {Object.entries(PAPERS).map(([key, { label, color }]) => (
            <button
              key={key}
              className="swatch"
              data-dark={PAPERS[key].dark || undefined}
              title={label}
              aria-label={label}
              aria-pressed={current.paper === key}
              style={{ background: color }}
              onClick={() => onChange({ paper: key })}
            >
              {current.paper === key && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Text">
        <div className="panel-swatches">
          {Object.entries(INKS).map(([key, { label }]) => (
            <button
              key={key}
              className="swatch"
              title={label}
              aria-label={label}
              aria-pressed={current.ink === key}
              style={{
                color: inkColor(key, current.paper),
                background: PAPERS[current.paper].color
              }}
              onClick={() => onChange({ ink: key })}
            >
              A
            </button>
          ))}
        </div>
      </Group>

      <Group label="Align">
        <div className="panel-options">
          {Object.entries(ALIGNS).map(([key, { label }]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              aria-pressed={current.align === key}
              onClick={() => onChange({ align: key })}
            >
              <AlignIcon align={key} />
            </button>
          ))}
        </div>
      </Group>
    </>
  )
}

// Three lines of text, lined up the way the button aligns them.
function AlignIcon({ align }: { align: string }): JSX.Element {
  const lines = [14, 8, 11].map((width, i) => {
    const x = align === 'left' ? 2 : align === 'right' ? 16 - 2 - width : (16 - width) / 2
    return <path key={i} d={`M${x} ${4 + i * 4} h${width}`} />
  })
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {lines}
      </g>
    </svg>
  )
}
