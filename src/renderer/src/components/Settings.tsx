import { useEffect, useRef, useState, type JSX } from 'react'
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
  UsersIcon,
  type IconComponent
} from './icons'
import { terminalLook, type TerminalLook as Look } from '../nodeStyle'
import { BUILT_IN_PET, PET_SIZES, forgetSprites, petSprite, type Sprite as Sheet } from '../pets'
import {
  CANVAS_KEYS,
  CODE_TOGGLE,
  REVIEW_TOGGLE,
  SHORTCUTS,
  keysLabel,
  type Shortcut
} from '../shortcuts'
import { AGENTS } from '../../../shared/agents'
import type { Theme } from '../../../preload'
import type { AppInfo, NodeStyle, PetInfo, Role, SavedRole } from '../../../shared/types'
import type { Prefs } from '../App'

interface Section {
  key: string
  label: string
  Icon: IconComponent
  keywords: string
}
type ChangePrefs = (patch: Partial<Prefs>) => void

// The sections down the left, in groups; `keywords` are what the search also matches.
const SECTIONS: Section[][] = [
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

const THEMES: { key: Theme; label: string; Icon: IconComponent }[] = [
  { key: 'light', label: 'Light', Icon: SunIcon },
  { key: 'dark', label: 'Dark', Icon: MoonIcon },
  { key: 'system', label: 'System', Icon: MonitorIcon }
]

// Where the new terminal dialog keeps the look it opens with (Launcher.tsx).
const LAUNCHER_MEMORY = 'new-terminal'

// The settings, in a dialog with the sections on the left and the chosen one on the right, and a
// search over the sections. `prefs` are the renderer's preferences (App.tsx) and onPrefs changes
// some of them; `hudBound` says whether the HUD's global shortcut could be bound; `theme` and
// onTheme are the app's theme; `roles` and the role handlers are the same the new terminal dialog
// uses. `initial` is the section it opens on.
export default function Settings({
  theme,
  onTheme,
  prefs,
  hudBound,
  onPrefs,
  roles,
  onSaveRole,
  onRemoveRole,
  initial = 'appearance',
  onClose
}: {
  theme: Theme
  onTheme: (theme: Theme) => void
  prefs: Prefs
  hudBound: boolean | null
  onPrefs: ChangePrefs
  roles: Record<string, Role>
  onSaveRole: (role: Role) => Promise<SavedRole | null>
  onRemoveRole: (key: string) => Promise<unknown>
  initial?: string
  onClose: () => void
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState(initial)
  const [query, setQuery] = useState('')
  const [closing, setClosing] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    dialog.current?.showModal()
    dialog.current?.focus()
    window.api.app.info().then(setInfo)
  }, [])

  const words = query.trim().toLowerCase()
  const matches = (s: Section): boolean =>
    !words || `${s.label} ${s.keywords}`.toLowerCase().includes(words)
  const groups = SECTIONS.map((group) => group.filter(matches)).filter((g) => g.length)
  const all = groups.flat()
  // A search that hides the open section shows the first one it found.
  const shown = all.some((s) => s.key === section) ? section : (all[0]?.key ?? section)
  const current = SECTIONS.flat().find((s) => s.key === shown) as Section

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
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === dialog.current
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === dialog.current) setClosing(true)
      }}
      onAnimationEnd={(e) => e.animationName === 'launcher-out' && onClose()}
      // The browser can close the dialog by itself (a second Escape it won't let be held back):
      // then there's no closing animation to wait for.
      onClose={onClose}
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
function Appearance({
  theme,
  onTheme
}: {
  theme: Theme
  onTheme: (theme: Theme) => void
}): JSX.Element {
  const [look, setLook] = useState<Look>(() => terminalLook(recall(LAUNCHER_MEMORY).look))
  const index = THEMES.findIndex((t) => t.key === theme)

  function change(next: NodeStyle): void {
    const memory = recall(LAUNCHER_MEMORY)
    const { theme, tone, size, cursor } = { ...look, ...next }
    localStorage.setItem(
      LAUNCHER_MEMORY,
      JSON.stringify({ ...memory, look: { theme, tone, size, cursor } })
    )
    setLook((current) => ({ ...current, ...next }) as Look)
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
function Agents({ prefs, onPrefs }: { prefs: Prefs; onPrefs: ChangePrefs }): JSX.Element {
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
function Roles({
  roles,
  onSaveRole,
  onRemoveRole
}: {
  roles: Record<string, Role>
  onSaveRole: (role: Role) => Promise<SavedRole | null>
  onRemoveRole: (key: string) => Promise<unknown>
}): JSX.Element {
  const [selected, setSelected] = useState(Object.keys(roles)[0])
  const [draft, setDraft] = useState<Role | null>(null)
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
          onChange={(change) => setDraft((d) => (d ? { ...d, ...change } : d))}
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
              if (role.key) await onRemoveRole(role.key)
              setSelected(Object.keys(roles)[0])
            }}
          />
        )
      )}
    </div>
  )
}

// The pet: what it does, which one (or none) and its size, the pets added and the folders they
// come from, and the HUD that comes with it.
function Pets({
  prefs,
  hudBound,
  onPrefs
}: {
  prefs: Prefs
  hudBound: boolean | null
  onPrefs: ChangePrefs
}): JSX.Element {
  const [pets, setPets] = useState<PetInfo[] | null>(null)
  const [folders, setFolders] = useState<Partial<Record<'nara' | 'codex', boolean>>>({})
  // Why the last pet added didn't make it, if it didn't.
  const [problem, setProblem] = useState<string | null>(null)

  async function add(): Promise<void> {
    const result = await window.api.pets.import()
    if (!result) return
    if (result.error !== undefined) return setProblem(result.error)
    setProblem(null)
    await load()
    onPrefs({ pet: result.id })
  }

  // Refresh reads the folders and every sprite sheet again.
  function load(): Promise<void> {
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
  const library: (Partial<Omit<PetInfo, 'id'>> & { id: string | null; name: string })[] = [
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
          A companion on your desktop, over every app, that follows your agents while Nara is open.
          Its bubble says who is working, who needs you and who is done; click it for the command
          center, where each agent can be answered or visited. Drag it anywhere on the screen.
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
            <kbd>⌃⌥Space</kbd>
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
function PetThumb({ id }: { id: string }): JSX.Element {
  const [sprite, setSprite] = useState<Sheet | null>(null)
  useEffect(() => {
    let current = true
    petSprite(id).then((next) => {
      if (current) setSprite(next)
    })
    return () => {
      current = false
    }
  }, [id])
  return sprite ? <Sprite sprite={sprite} row="idle" width={56} still /> : <PawIcon size={22} />
}

// Every shortcut, read-only: the app's, the canvas's single keys, and the pointer.
function Keyboard(): JSX.Element {
  const app: [string, Shortcut][] = [
    ['New workspace', SHORTCUTS.newWorkspace],
    ['All workspaces', SHORTCUTS.overview],
    ['Add project', SHORTCUTS.newProject],
    ['Show or hide the sidebar', SHORTCUTS.sidebar],
    ['Switch light and dark', SHORTCUTS.theme],
    ['Settings', SHORTCUTS.settings]
  ]
  const anywhere: [string, string][] = [['Floating HUD', '⌃⌥Space']]
  const canvas = {
    select: 'Pointer',
    hand: 'Hand',
    terminal: 'New terminal',
    note: 'New note',
    browser: 'New browser',
    draw: 'Draw',
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    line: 'Line',
    arrow: 'Arrow',
    text: 'Text',
    erase: 'Erase',
    link: 'Connect',
    minimap: 'Minimap',
    zoomFit: 'Fit everything',
    zoomReset: 'Zoom to 100%',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    expand: 'Fill the screen with the selected node',
    shortcuts: 'Show the shortcuts'
  }
  const keys = Object.entries(canvas).map(([action, label]) => [
    label,
    Object.keys(CANVAS_KEYS).find((key) => CANVAS_KEYS[key] === action) ?? ''
  ])
  const board: [string, string][] = [
    ['Undo, redo', '⌃Z  ⌃⇧Z'],
    ['Duplicate', '⌃D'],
    ['Copy, paste', '⌃C  ⌃V'],
    ['Bring to front, send to back', ']  ['],
    ['Square, straight line', 'Shift + Drag'],
    ['Edit text', 'Enter or double-click']
  ]
  const code: [string, string][] = [
    ['Switch between canvas and code', keysLabel(CODE_TOGGLE)],
    ['Open a file by name', '⌃P'],
    ['Save', '⌃S'],
    ['Close the file', '⌃W'],
    ['Next, previous file', '⌃Tab  ⌃⇧Tab'],
    ['Rename, trash in the explorer', 'F2  Del']
  ]
  const review: [string, string][] = [
    ['Switch between canvas and review', keysLabel(REVIEW_TOGGLE)],
    ['Comment on a line', 'Click beside it'],
    ['Comment on lines', 'Select, right-click'],
    ['Leave the comment', '⌃Enter'],
    ['Save an edit to the file', '⌃S']
  ]
  const pointer: [string, string][] = [
    ['Select several', 'Drag on the canvas'],
    ['Add to the selection', 'Shift + Drag'],
    ['Pan', 'Scroll, Space + Drag or Right drag'],
    ['Zoom', 'Ctrl + Scroll']
  ]

  return (
    <>
      <ShortcutList title="App" rows={app.map(([label, s]) => [label, keysLabel(s)])} />
      <ShortcutList title="From any app" rows={anywhere} />
      <ShortcutList title="Canvas" rows={keys.map(([label, key]) => [label, key.toUpperCase()])} />
      <ShortcutList title="Whiteboard" rows={board} />
      <ShortcutList title="Code" rows={code} />
      <ShortcutList title="Review" rows={review} />
      <ShortcutList title="Pointer" rows={pointer} />
    </>
  )
}

function ShortcutList({ title, rows }: { title: string; rows: [string, string][] }): JSX.Element {
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

function About({ info }: { info: AppInfo | null }): JSX.Element {
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

function recall(key: string): { look?: NodeStyle } {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? {}
  } catch {
    return {}
  }
}
