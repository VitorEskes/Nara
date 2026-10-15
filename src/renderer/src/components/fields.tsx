import type { JSX, ReactNode } from 'react'

// The pieces the side panel and the new terminal dialog build their settings from.

// A titled group of settings.
export function Group({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="panel-group">
      <legend>{label}</legend>
      {children}
    </fieldset>
  )
}

// A row of options, one of them chosen: `options` maps each key to its { label }.
export function Options<K extends string>({
  options,
  value,
  onPick
}: {
  options: Record<K, { label: string }>
  value: K | null | undefined
  onPick: (key: K) => void
}): JSX.Element {
  return (
    <div className="panel-options">
      {(Object.entries(options) as [K, { label: string }][]).map(([key, { label }]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

// An on/off setting: its name and a line about it, the switch on the right, and anything else
// (`children`, a shortcut) before the switch.
export function Switch({
  checked,
  label,
  detail,
  onChange,
  children
}: {
  checked: boolean
  label: string
  detail?: ReactNode
  onChange: (checked: boolean) => void
  children?: ReactNode
}): JSX.Element {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {detail && <span className="switch-detail">{detail}</span>}
      </span>
      {children}
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
