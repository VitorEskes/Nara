import { ALIGNS, FONTS, INKS, PAPERS, SIZES, resolveStyle } from '../noteStyle'

// Side panel for the selected note, like Excalidraw's: font, size, colors and alignment of its
// text. onChange gets only the key that changed, e.g. { size: 'l' }.
export default function NotePanel({ style, onChange }) {
  const current = resolveStyle(style)

  return (
    <aside className="note-panel" aria-label="Note style">
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
        <div className="panel-options">
          {Object.entries(SIZES).map(([key, { label }]) => (
            <button
              key={key}
              aria-pressed={current.size === key}
              onClick={() => onChange({ size: key })}
            >
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Text">
        <Swatches options={INKS} value={current.ink} onPick={(ink) => onChange({ ink })} />
      </Group>

      <Group label="Paper">
        <Swatches options={PAPERS} value={current.paper} onPick={(paper) => onChange({ paper })} />
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
    </aside>
  )
}

function Group({ label, children }) {
  return (
    <fieldset className="panel-group">
      <legend>{label}</legend>
      {children}
    </fieldset>
  )
}

function Swatches({ options, value, onPick }) {
  return (
    <div className="panel-swatches">
      {Object.entries(options).map(([key, { label, color }]) => (
        <button
          key={key}
          title={label}
          aria-label={label}
          aria-pressed={value === key}
          style={{ background: color }}
          onClick={() => onPick(key)}
        />
      ))}
    </div>
  )
}

// Three lines of text, lined up the way the button aligns them.
function AlignIcon({ align }) {
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
