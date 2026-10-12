import { useEffect, useRef, useState } from 'react'
import TerminalLook from './TerminalLook'
import RoleEditor, { RoleDetail } from './RoleEditor'
import Shika from './Shika'
import { Sprite } from './Pet'
import NodeIcon from './NodeIcon'
import { Group, Options, Switch } from './fields'
import {
  ArrowUpRightIcon,
  BrandMark,
  CheckIcon,
  CloseIcon,
  FolderIcon,
  InfoIcon,
  KeyboardIcon,
  MicIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PawIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SleepIcon,
  SparkIcon,
  SunIcon,
  UsersIcon
} from './icons'
import { terminalLook } from '../nodeStyle'
import { BUILT_IN_PET, PET_SIZES, forgetSprites, petSprite } from '../pets'
import { CANVAS_KEYS, SHORTCUTS, keysLabel } from '../shortcuts'
import { AGENTS } from '../../../shared/agents'

// The sections down the left, in groups; `keywords` are what the search also matches.
const SECTIONS = [
  [
    {
      key: 'appearance',
      label: 'Appearance',
      Icon: PaletteIcon,
      keywords: 'theme light dark system terminal colors font size cursor look'
    }
  ],
  [
    { key: 'agents', label: 'Agents', Icon: SparkIcon, keywords: 'claude codex command cli flags' },
    {
      key: 'roles',
      label: 'Roles',
      Icon: UsersIcon,
      keywords: 'role instructions orchestrator worker reviewer prompt team'
    },
    {
      key: 'voice',
      label: 'Voice',
      Icon: MicIcon,
      keywords: 'dictation microphone speech transcribe whisper openai groq shortcut'
    },
    {
      key: 'pets',
      label: 'Pets',
      Icon: PawIcon,
      keywords: 'pet desktop companion status shika codex sprite hud import add'
    }
  ],
  [
    {
      key: 'keyboard',
      label: 'Keyboard',
      Icon: KeyboardIcon,
      keywords: 'shortcuts keys mouse pan zoom'
    },
    { key: 'about', label: 'About', Icon: InfoIcon, keywords: 'version data folder' }
  ]
]

const THEMES = [
  { key: 'light', label: 'Light', Icon: SunIcon },
  { key: 'dark', label: 'Dark', Icon: MoonIcon },
  { key: 'system', label: 'System', Icon: MonitorIcon }
]

// Where the new terminal dialog keeps the look it opens with (Launcher.jsx).
const LAUNCHER_MEMORY = 'new-terminal'

// The settings, in a dialog with the sections on the left and the chosen one on the right, and a
// search over the sections. `prefs` are the renderer's preferences (App.jsx) and onPrefs changes
// some of them; `hudBound` says whether the HUD's global shortcut could be bound; `theme` and onTheme are the app's theme; `roles` and the role handlers are the
// same the new terminal dialog uses.
export default function Settings({
  theme,
  onTheme,
  prefs,
  hudBound,
  voiceBound,
  onPrefs,
  roles,
  onSaveRole,
  onRemoveRole,
  onClose
}) {
  const dialog = useRef(null)
  const [section, setSection] = useState('appearance')
  const [query, setQuery] = useState('')
  const [closing, setClosing] = useState(false)
  const [info, setInfo] = useState(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    dialog.current.showModal()
    dialog.current.focus()
    window.api.app.info().then(setInfo)
  }, [])

  const words = query.trim().toLowerCase()
  const matches = (s) => !words || `${s.label} ${s.keywords}`.toLowerCase().includes(words)
  const groups = SECTIONS.map((group) => group.filter(matches)).filter((g) => g.length)
  const all = groups.flat()
  // A search that hides the open section shows the first one it found.
  const shown = all.some((s) => s.key === section) ? section : (all[0]?.key ?? section)
  const current = SECTIONS.flat().find((s) => s.key === shown)

  return (
    <dialog
      ref={dialog}
      className={closing ? 'settings closing' : 'settings'}
      tabIndex={-1}
      aria-label="Settings"
      onCancel={(e) => {
        e.preventDefault()
        setClosing(true)
      }}
      onPointerDown={(e) => (pressedBackdrop.current = e.target === dialog.current)}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === dialog.current) setClosing(true)
      }}
      onAnimationEnd={(e) => e.animationName === 'launcher-out' && onClose()}
    >
      <nav className="settings-nav" aria-label="Sections">
        <label className="settings-search">
          <SearchIcon size={14} />
          <input
            value={query}
            placeholder="Search settings…"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="settings-brand">
          <BrandMark />
          <span>
            <strong>Nara</strong>
            <small>{info ? `Version ${info.version}` : ' '}</small>
          </span>
        </div>

        {groups.map((group, i) => (
          <ul key={i} className="settings-group">
            {group.map(({ key, label, Icon }) => (
              <li key={key}>
                <button
                  className="settings-link"
                  aria-current={shown === key ? 'page' : undefined}
                  onClick={() => setSection(key)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        ))}
        {!all.length && <p className="settings-none">Nothing matches “{query.trim()}”</p>}
      </nav>

      <section className="settings-page" aria-labelledby="settings-title">
        <header className="settings-head">
          <h2 id="settings-title">{current.label}</h2>
          <button
            className="icon-button"
            aria-label="Close"
            title="Close"
            onClick={() => setClosing(true)}
          >
            <CloseIcon />
          </button>
        </header>
        {/* The key replays the fade when the section changes. */}
        <div className="settings-body" key={shown}>
          {shown === 'appearance' && <Appearance theme={theme} onTheme={onTheme} />}
          {shown === 'agents' && <Agents prefs={prefs} onPrefs={onPrefs} />}
          {shown === 'roles' && (
            <Roles roles={roles} onSaveRole={onSaveRole} onRemoveRole={onRemoveRole} />
          )}
          {shown === 'voice' && <Voice prefs={prefs} bound={voiceBound} onPrefs={onPrefs} />}
          {shown === 'pets' && <Pets prefs={prefs} hudBound={hudBound} onPrefs={onPrefs} />}
          {shown === 'keyboard' && <Keyboard />}
          {shown === 'about' && <About info={info} />}
        </div>
      </section>
    </dialog>
  )
}

// The app's theme, and the look new terminals start with: the one the new terminal dialog
// remembers, so changing it here or there is the same.
function Appearance({ theme, onTheme }) {
  const [look, setLook] = useState(() => terminalLook(recall(LAUNCHER_MEMORY).look))
  const index = THEMES.findIndex((t) => t.key === theme)

  function change(next) {
    const memory = recall(LAUNCHER_MEMORY)
    const { theme, tone, size, cursor } = { ...look, ...next }
    localStorage.setItem(
      LAUNCHER_MEMORY,
      JSON.stringify({ ...memory, look: { theme, tone, size, cursor } })
    )
    setLook((current) => ({ ...current, ...next }))
  }

  return (
    <>
      <Group label="Theme">
        <div
          className="segmented settings-theme"
          role="group"
          aria-label="Theme"
          style={{ '--index': index, '--count': THEMES.length }}
        >
          {THEMES.map(({ key, label, Icon }) => (
            <button key={key} aria-pressed={theme === key} onClick={() => onTheme(key)}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </Group>
      <div className="settings-card">
        <h3>New terminals</h3>
        <p>How a terminal looks when it opens. Each one can still change it on its own.</p>
        <TerminalLook look={look} icons={false} onChange={change} />
      </div>
    </>
  )
}

// The command each agent starts with, in place of its own: a version pinned with flags, or
// another binary.
function Agents({ prefs, onPrefs }) {
  return (
    <>
      <p className="settings-lead">
        The command each agent starts with. The new terminal dialog fills it in, and Nara adds its
        own flags after it.
      </p>
      {Object.entries(AGENTS).map(([key, { label, command }]) => (
        <div key={key} className="settings-row">
          <span className="settings-row-icon">
            <NodeIcon type="terminal" agent={key} size={18} />
          </span>
          <span className="settings-row-label">{label}</span>
          <span className="command-input">
            <span className="command-prompt" aria-hidden="true">
              ❯
            </span>
            <input
              className="text-input mono"
              value={prefs.commands[key] ?? ''}
              placeholder={command}
              spellCheck={false}
              aria-label={`${label} command`}
              onChange={(e) => onPrefs({ commands: { ...prefs.commands, [key]: e.target.value } })}
            />
          </span>
        </div>
      ))}
    </>
  )
}

// Every role, to read; the user's own, to write, change and delete.
function Roles({ roles, onSaveRole, onRemoveRole }) {
  const [selected, setSelected] = useState(Object.keys(roles)[0])
  const [draft, setDraft] = useState(null)
  const role = roles[selected] ?? roles[Object.keys(roles)[0]]

  return (
    <div className="role-pane settings-roles">
      <div className="role-list" role="listbox" aria-label="Roles">
        {Object.entries(roles).map(([key, value]) => (
          <button
            key={key}
            type="button"
            role="option"
            className="role-item"
            data-tone={value.tone}
            aria-selected={!draft && role === value}
            onClick={() => {
              setDraft(null)
              setSelected(key)
            }}
          >
            <span className="role-dot" />
            <span className="role-label">{value.label}</span>
            {key.startsWith('custom-') && <span className="role-mine">Yours</span>}
          </button>
        ))}
        <button
          type="button"
          className="role-item new"
          aria-pressed={Boolean(draft && !draft.key)}
          onClick={() => setDraft({ label: '', instructions: '', tone: 'leaf' })}
        >
          <PlusIcon size={13} />
          New role
        </button>
      </div>
      {draft ? (
        <RoleEditor
          key={draft.key ?? 'new'}
          draft={draft}
          onChange={(change) => setDraft((d) => ({ ...d, ...change }))}
          onSave={async () => {
            const saved = await onSaveRole(draft)
            if (!saved) return
            setDraft(null)
            setSelected(saved.key)
          }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        role && (
          <RoleDetail
            key={role.key ?? role.label}
            role={role}
            custom={Boolean(role.key?.startsWith('custom-'))}
            onEdit={() => setDraft({ ...role })}
            onRemove={async () => {
              await onRemoveRole(role.key)
              setSelected(Object.keys(roles)[0])
            }}
          />
        )
      )}
    </div>
  )
}

// Where the voice bar sends what it hears to become text.
const ENGINES = [
  { key: 'api', label: 'Transcription API' },
  { key: 'local', label: 'whisper.cpp on this computer' }
]
const PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'whisper-1' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo' }
]

// The voice bar: its shortcut, the engine that turns speech into text, and the language.
function Voice({ prefs, bound, onPrefs }) {
  const [settings, setSettings] = useState(null)
  const [key, setKey] = useState('')

  useEffect(() => {
    window.api.voice.settings().then(setSettings)
  }, [])

  async function save(patch) {
    setSettings(await window.api.voice.save(patch))
  }

  if (!settings) return null
  const engine = ENGINES.findIndex((e) => e.key === settings.provider)
  const field = (name, label, placeholder, mono = true) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        key={`${name}:${settings[name]}`}
        className={mono ? 'text-input mono' : 'text-input'}
        defaultValue={settings[name]}
        placeholder={placeholder}
        spellCheck={false}
        onBlur={(e) => e.target.value !== settings[name] && save({ [name]: e.target.value })}
      />
    </label>
  )

  return (
    <>
      <div className="settings-card">
        <h3>Voice bar</h3>
        <p>
          Speak to an agent from anywhere: the bar listens, turns what you said into text you can
          fix, and sends it to the agent you pick. Enter stops, Enter again sends.
        </p>
      </div>

      <div className="settings-toggles">
        <Switch
          checked={prefs.voice}
          label="Shortcut"
          detail={
            prefs.voice && bound === false
              ? 'Your desktop didn’t give Nara the shortcut'
              : 'Opens the bar over every app'
          }
          onChange={(voice) => onPrefs({ voice })}
        >
          <kbd>Ctrl Alt V</kbd>
        </Switch>
      </div>

      <Group label="Engine">
        <div
          className="segmented"
          role="group"
          aria-label="Engine"
          style={{ '--index': engine, '--count': ENGINES.length }}
        >
          {ENGINES.map(({ key: name, label }) => (
            <button
              key={name}
              aria-pressed={settings.provider === name}
              onClick={() => save({ provider: name })}
            >
              {label}
            </button>
          ))}
        </div>
      </Group>

      {settings.provider === 'api' ? (
        <div className="settings-form">
          <div className="settings-presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="idea"
                aria-pressed={settings.baseUrl === preset.baseUrl}
                onClick={() => save({ baseUrl: preset.baseUrl, model: preset.model })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {field('baseUrl', 'Address', 'https://api.openai.com/v1')}
          {field('model', 'Model', 'whisper-1')}
          <label className="field">
            <span className="field-label">API key</span>
            <input
              className="text-input mono"
              type="password"
              value={key}
              placeholder={settings.hasKey ? 'Saved · type to replace it' : 'sk-…'}
              spellCheck={false}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => {
                if (!key) return
                save({ key })
                setKey('')
              }}
            />
            <span className="field-hint">
              Kept in Nara’s data folder, encrypted with your system’s keyring when it has one. The
              audio goes to this address only when you dictate.
            </span>
          </label>
        </div>
      ) : (
        <div className="settings-form">
          {field('whisperBin', 'Program', 'whisper-cli')}
          {field('whisperModel', 'Model file', '~/models/ggml-base.bin')}
          <span className="field-hint">
            whisper.cpp runs here, so the audio never leaves this computer. Download a model (ggml)
            from its repository and point to it.
          </span>
        </div>
      )}

      <div className="settings-form">
        {field('language', 'Language', 'Detect it (or pt, en, es…)', false)}
      </div>
    </>
  )
}

// The pet: what it does, which one (or none) and its size, the pets added and the folders they
// come from, and the HUD that comes with it.
function Pets({ prefs, hudBound, onPrefs }) {
  const [pets, setPets] = useState(null)
  const [folders, setFolders] = useState({})
  // Why the last pet added didn't make it, if it didn't.
  const [problem, setProblem] = useState(null)

  async function add() {
    const result = await window.api.pets.import()
    if (!result) return
    if (result.error) return setProblem(result.error)
    setProblem(null)
    await load()
    onPrefs({ pet: result.id })
  }

  // Refresh reads the folders and every sprite sheet again.
  function load() {
    forgetSprites()
    return Promise.all([window.api.pets.list(), window.api.pets.folders()]).then(
      ([list, found]) => {
        setPets(list)
        setFolders(found)
      }
    )
  }

  useEffect(() => {
    Promise.all([window.api.pets.list(), window.api.pets.folders()]).then(([list, found]) => {
      setPets(list)
      setFolders(found)
    })
  }, [])

  const chosen = prefs.pet
  const library = [
    { id: null, name: 'None' },
    { id: BUILT_IN_PET, name: 'Shika', source: 'Nara' },
    ...(pets ?? [])
  ]
  const current = library.find((p) => p.id === chosen)

  return (
    <>
      <div className="settings-card pet-intro">
        <div className="pet-intro-head">
          <h3>Pet</h3>
          {current?.id && <span>{current.name}</span>}
        </div>
        <p>
          A companion in the corner of the window that follows your agents. Its bubble says who is
          working, who needs you and who is done; click it for the command center, where each agent
          can be answered or visited. Drag it anywhere.
        </p>
      </div>

      <Group label="Library">
        <div className="pet-library">
          {library.map((pet) => (
            <button
              key={pet.id ?? 'none'}
              className="pet-card"
              aria-pressed={chosen === pet.id}
              title={pet.description || undefined}
              onClick={() => onPrefs({ pet: pet.id })}
            >
              <span className="pet-card-art">
                {pet.id === null ? (
                  <SleepIcon size={26} />
                ) : pet.id === BUILT_IN_PET ? (
                  <Shika />
                ) : (
                  <PetThumb id={pet.id} />
                )}
              </span>
              <span className="pet-card-name">{pet.name}</span>
              {pet.source && <span className="pet-card-source">{pet.source}</span>}
              {chosen === pet.id && (
                <span className="pet-card-check" aria-hidden="true">
                  <CheckIcon size={11} />
                </span>
              )}
            </button>
          ))}
          <button
            className="pet-card add"
            title="A Codex pet: its pet.json, or a .zip"
            onClick={add}
          >
            <span className="pet-card-art">
              <PlusIcon size={22} />
            </span>
            <span className="pet-card-name">Add pet</span>
            <span className="pet-card-source">Codex format</span>
          </button>
        </div>
        {problem && <p className="field-hint warning">{problem}</p>}
      </Group>

      <Group label="With the pet">
        <div className="settings-toggles">
          <Switch
            checked={prefs.hud}
            label="Floating HUD"
            detail={
              prefs.hud && hudBound === false
                ? 'Your desktop didn’t give Nara the shortcut'
                : 'The command center over every app, from anywhere'
            }
            onChange={(hud) => onPrefs({ hud })}
          >
            <kbd>Ctrl Alt Space</kbd>
          </Switch>
        </div>
      </Group>

      <Group label="Size">
        <div className="settings-size">
          <Options
            options={PET_SIZES}
            value={prefs.petSize}
            onPick={(petSize) => onPrefs({ petSize })}
          />
        </div>
      </Group>

      <div className="settings-actions">
        <button className="button small" onClick={() => window.api.pets.open('nara')}>
          <FolderIcon size={14} />
          Open pets folder
        </button>
        <button
          className="button small"
          disabled={!folders.codex}
          title={folders.codex ? undefined : 'Codex has no pets folder on this computer'}
          onClick={() => window.api.pets.open('codex')}
        >
          <FolderIcon size={14} />
          Open Codex pets folder
        </button>
        <button className="button small" onClick={load}>
          <RefreshIcon size={14} />
          Refresh
        </button>
      </div>
      <p className="settings-note">
        Pets use Codex’s format: a folder with <code>pet.json</code> and{' '}
        <code>spritesheet.webp</code>. Nara reads Codex’s pets folder without ever writing to it;
        the pets you add by hand go in Nara’s own.
      </p>
    </>
  )
}

// The first idle frame of a pet, for its card.
function PetThumb({ id }) {
  const [sprite, setSprite] = useState(null)
  useEffect(() => {
    let current = true
    petSprite(id).then((next) => current && setSprite(next))
    return () => {
      current = false
    }
  }, [id])
  return sprite ? <Sprite sprite={sprite} row="idle" width={56} still /> : <PawIcon size={22} />
}

// Every shortcut, read-only: the app's, the canvas's single keys, and the pointer.
function Keyboard() {
  const app = [
    ['New workspace', SHORTCUTS.newWorkspace],
    ['All workspaces', SHORTCUTS.overview],
    ['Add project', SHORTCUTS.newProject],
    ['Show or hide the sidebar', SHORTCUTS.sidebar],
    ['Switch light and dark', SHORTCUTS.theme],
    ['Settings', SHORTCUTS.settings]
  ]
  const canvas = {
    select: 'Pointer',
    hand: 'Hand',
    terminal: 'New terminal',
    note: 'New note',
    draw: 'Draw',
    erase: 'Erase',
    minimap: 'Minimap',
    zoomFit: 'Fit everything',
    zoomReset: 'Zoom to 100%'
  }
  const keys = Object.entries(canvas).map(([action, label]) => [
    label,
    Object.keys(CANVAS_KEYS).find((key) => CANVAS_KEYS[key] === action)
  ])
  const pointer = [
    ['Pan', 'Drag'],
    ['Select several', 'Shift + Drag'],
    ['Pan from anywhere', 'Right drag'],
    ['Zoom', 'Ctrl + Scroll']
  ]

  return (
    <>
      <ShortcutList title="App" rows={app.map(([label, s]) => [label, keysLabel(s)])} />
      <ShortcutList title="Canvas" rows={keys.map(([label, key]) => [label, key.toUpperCase()])} />
      <ShortcutList title="Pointer" rows={pointer} />
    </>
  )
}

function ShortcutList({ title, rows }) {
  return (
    <Group label={title}>
      <dl className="shortcut-list">
        {rows.map(([label, keys]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <kbd>{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Group>
  )
}

function About({ info }) {
  return (
    <div className="settings-about">
      <BrandMark />
      <h3>Nara</h3>
      <p>AI coding agents on an infinite canvas</p>
      <span className="settings-version">{info ? `Version ${info.version}` : ' '}</span>
      <div className="settings-row about-data">
        <span className="settings-row-icon">
          <FolderIcon size={16} />
        </span>
        <span className="settings-row-label">
          Data folder
          <small>{info?.data}</small>
        </span>
        <button className="button small" onClick={() => window.api.app.openData()}>
          Open
          <ArrowUpRightIcon size={13} />
        </button>
      </div>
    </div>
  )
}

function recall(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}
