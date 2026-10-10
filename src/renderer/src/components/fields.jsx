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
