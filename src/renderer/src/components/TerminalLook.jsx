import { Group, Options } from './fields'
import { CloseIcon } from './icons'
import { GLYPHS, programIcon } from '../glyphs'
import { CURSORS, TERMINAL_SIZES, TONES } from '../nodeStyle'
import { TERMINAL_THEMES } from '../terminalThemes'

// A terminal's look: its color scheme, a tone, the icon on its bar, the text size and the cursor.
// `look` has every key filled in (terminalLook), `agent` says which icon is the program's own,
// and onChange gets only the key that changed. The side panel and the new terminal dialog both
// show it; the dialog also names the schemes under their swatches. The settings, which set the
// look of every new terminal, leave the icon out (`icons={false}`): it depends on the program.
export default function TerminalLook({ look, agent, icons = true, onChange }) {
  const icon = look.icon ?? programIcon(agent)
  return (
    <>
      <Group label="Theme">
        <div className="themes">
          {Object.entries(TERMINAL_THEMES).map(([key, { label, colors }]) => (
            <button
              key={key}
              type="button"
              className="theme-option"
              title={label}
              aria-label={label}
              aria-pressed={look.theme === key}
              onClick={() => onChange({ theme: key })}
            >
              {/* A terminal in miniature: a prompt, a line of output and the cursor. */}
              <span
                className="theme-swatch"
                style={{
                  background: colors.background,
                  '--fg': colors.foreground,
                  '--a': colors.green,
                  '--b': colors.blue,
                  '--c': colors.cursor
                }}
              >
                <i />
                <i />
                <i />
              </span>
              <span className="theme-name">{label}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group label="Color">
        <div className="tones">
          <button
            type="button"
            className="tone-dot none"
            title="No color"
            aria-label="No color"
            aria-pressed={!look.tone}
            onClick={() => onChange({ tone: undefined })}
          >
            <CloseIcon size={12} />
          </button>
          {Object.entries(TONES).map(([key, { label }]) => (
            <button
              key={key}
              type="button"
              className="tone-dot"
              data-tone={key}
              title={label}
              aria-label={label}
              aria-pressed={look.tone === key}
              onClick={() => onChange({ tone: key })}
            />
          ))}
        </div>
      </Group>

      {icons && (
        <Group label="Icon">
          <div className="glyphs">
            {Object.entries(GLYPHS).map(([key, { label, Icon }]) => (
              <button
                key={key}
                type="button"
                title={key === programIcon(agent) ? `${label} (the program’s own)` : label}
                aria-label={label}
                aria-pressed={icon === key}
                // The program's own icon is saved as none, so it follows the program.
                onClick={() => onChange({ icon: key === programIcon(agent) ? undefined : key })}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        </Group>
      )}

      <div className="look-row">
        <Group label="Text size">
          <Options
            options={TERMINAL_SIZES}
            value={look.size}
            onPick={(size) => onChange({ size })}
          />
        </Group>

        <Group label="Cursor">
          <div className="panel-options">
            {Object.entries(CURSORS).map(([key, { label }]) => (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={look.cursor === key}
                onClick={() => onChange({ cursor: key })}
              >
                <span className="cursor-sample" data-cursor={key} />
              </button>
            ))}
          </div>
        </Group>
      </div>
    </>
  )
}
