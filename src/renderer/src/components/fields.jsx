// The pieces the side panel and the new terminal dialog build their settings from.

// A titled group of settings.
export function Group({ label, children }) {
  return (
    <fieldset className="panel-group">
      <legend>{label}</legend>
      {children}
    </fieldset>
  )
}

// A row of options, one of them chosen: `options` maps each key to its { label }.
export function Options({ options, value, onPick }) {
  return (
    <div className="panel-options">
      {Object.entries(options).map(([key, { label }]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

// An on/off setting: its name and a line about it, the switch on the right, and anything else
// (`children`, a shortcut) before the switch.
export function Switch({ checked, label, detail, onChange, children }) {
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
