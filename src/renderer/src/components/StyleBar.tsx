import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { BringFrontIcon, CopyIcon, SendBackIcon, TrashIcon } from './icons'
import {
  COLORS,
  DASHES,
  FILLS,
  STROKES,
  TEXT_FONTS,
  TEXT_SIZES,
  WIDTHS,
  type FullShapeStyle,
  type StyleKey
} from '../shapes'
import { tip } from '../tip'

// The style of the whiteboard: above the dock while a drawing tool is on or shapes are selected.
// Each group opens a small popover: the color (and the fill, for closed shapes), the stroke
// (width, clean or sketched, dashes) and the text (size and font). `style` is the style shown,
// with every key filled in; `keys` the ones that apply (shapes.js styleKeys); onChange gets the
// keys that changed. With shapes selected, `actions` holds what can be done to them.
export default function StyleBar({
  style,
  keys,
  onChange,
  actions
}: {
  style: FullShapeStyle
  keys: StyleKey[]
  onChange: (change: Partial<FullShapeStyle>) => void
  actions: { front: () => void; back: () => void; duplicate: () => void; remove: () => void } | null
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const has = (key: StyleKey): boolean => keys.includes(key)

  // A press anywhere else puts the popover away.
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent): void {
      if (!bar.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const toggle = (name: string): void => setOpen((current) => (current === name ? null : name))

  return (
    <div className="floating style-bar" ref={bar} role="toolbar" aria-label="Style">
      <Group name="color" open={open} onToggle={toggle} label="Color">
        <span
          className="style-swatch-current"
          style={{ '--swatch': COLORS[style.stroke].color }}
          data-fill={has('fill') ? style.fill : 'none'}
        />
        <Popover>
          <Row label="Stroke">
            {Object.entries(COLORS).map(([key, { label, color }]) => (
              <button
                key={key}
                className="style-swatch"
                style={{ '--swatch': color }}
                title={label}
                aria-label={label}
                aria-pressed={style.stroke === key}
                onClick={() => onChange({ stroke: key })}
              />
            ))}
          </Row>
          {has('fill') && (
            <Row label="Fill">
              {Object.entries(FILLS).map(([key, { label }]) => (
                <button
                  key={key}
                  className="style-option"
                  title={label}
                  aria-label={label}
                  aria-pressed={style.fill === key}
                  onClick={() => onChange({ fill: key })}
                >
                  <FillIcon kind={key} />
                </button>
              ))}
            </Row>
          )}
        </Popover>
      </Group>

      {has('width') && (
        <Group name="stroke" open={open} onToggle={toggle} label="Stroke">
          <StrokeIcon width={WIDTHS[style.width].px} sketch={style.sketch} dash={style.dash} />
          <Popover>
            <Row label="Width">
              {Object.entries(WIDTHS).map(([key, { label, px }]) => (
                <button
                  key={key}
                  className="style-option"
                  title={label}
                  aria-label={label}
                  aria-pressed={style.width === key}
                  onClick={() => onChange({ width: key })}
                >
                  <StrokeIcon width={px} />
                </button>
              ))}
            </Row>
            {has('sketch') && (
              <Row label="Line">
                {Object.entries(STROKES).map(([key, { label }]) => (
                  <button
                    key={key}
                    className="style-option"
                    title={label}
                    aria-label={label}
                    aria-pressed={style.sketch === key}
                    onClick={() => onChange({ sketch: key })}
                  >
                    <StrokeIcon width={2} sketch={key} />
                  </button>
                ))}
              </Row>
            )}
            {has('dash') && (
              <Row label="Dashes">
                {Object.entries(DASHES).map(([key, { label }]) => (
                  <button
                    key={key}
                    className="style-option"
                    title={label}
                    aria-label={label}
                    aria-pressed={style.dash === key}
                    onClick={() => onChange({ dash: key })}
                  >
                    <StrokeIcon width={2} dash={key} />
                  </button>
                ))}
              </Row>
            )}
          </Popover>
        </Group>
      )}

      {has('size') && (
        <Group name="text" open={open} onToggle={toggle} label="Text">
          <span
            className="style-text-current"
            style={{ fontFamily: TEXT_FONTS[style.font].family }}
          >
            Aa
          </span>
          <Popover>
            <Row label="Size">
              {Object.entries(TEXT_SIZES).map(([key, { label }]) => (
                <button
                  key={key}
                  className="style-option text"
                  aria-pressed={style.size === key}
                  onClick={() => onChange({ size: key })}
                >
                  {label}
                </button>
              ))}
            </Row>
            <Row label="Font">
              {Object.entries(TEXT_FONTS).map(([key, { label, family }]) => (
                <button
                  key={key}
                  className="style-option text"
                  title={label}
                  aria-label={label}
                  aria-pressed={style.font === key}
                  style={{ fontFamily: family }}
                  onClick={() => onChange({ font: key })}
                >
                  Aa
                </button>
              ))}
            </Row>
          </Popover>
        </Group>
      )}

      {actions && (
        <>
          <span className="dock-divider" />
          <button className="icon-button" {...tip('Bring to front', ']')} onClick={actions.front}>
            <BringFrontIcon />
          </button>
          <button className="icon-button" {...tip('Send to back', '[')} onClick={actions.back}>
            <SendBackIcon />
          </button>
          <button
            className="icon-button"
            {...tip('Duplicate', 'Ctrl+D')}
            onClick={() => actions.duplicate()}
          >
            <CopyIcon />
          </button>
          <button className="icon-button danger" {...tip('Delete', 'Del')} onClick={actions.remove}>
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  )
}

// A button that opens its popover (the last child) above it.
function Group({
  name,
  open,
  onToggle,
  label,
  children
}: {
  name: string
  open: string | null
  onToggle: (name: string) => void
  label: string
  children: [ReactNode, ReactNode]
}): JSX.Element {
  const [face, popover] = children
  return (
    <div className="style-group">
      <button
        className="style-face"
        data-tip={open === name ? undefined : label}
        aria-label={label}
        aria-expanded={open === name}
        onClick={() => onToggle(name)}
      >
        {face}
      </button>
      {open === name && popover}
    </div>
  )
}

function Popover({ children }: { children: ReactNode }): JSX.Element {
  return <div className="style-popover">{children}</div>
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="style-row">
      <span className="style-row-label">{label}</span>
      <div className="style-row-options">{children}</div>
    </div>
  )
}

// A short stroke drawn as it would look: its width, wobble and dashes.
function StrokeIcon({
  width,
  sketch,
  dash
}: {
  width: number
  sketch?: string
  dash?: string
}): JSX.Element {
  const d = sketch === 'sketch' ? 'M3 11.5C6 8 8 13 11 8.5S15 6 17 5' : 'M3 10h14'
  const pattern =
    dash === 'dashed'
      ? `${width * 2.2} ${width * 1.6}`
      : dash === 'dotted'
        ? `0.1 ${width * 1.9}`
        : undefined
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={Math.min(width, 4.5)}
        strokeLinecap="round"
        strokeDasharray={pattern}
      />
    </svg>
  )
}

function FillIcon({ kind }: { kind: string }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="12"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={kind === 'none' ? 'none' : 'currentColor'}
        fillOpacity={kind === 'tint' ? 0.25 : 1}
      />
      {kind === 'none' && <path d="M4 14L14 4" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  )
}
