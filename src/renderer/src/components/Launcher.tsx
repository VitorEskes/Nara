import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  type SyntheticEvent
} from 'react'
import TerminalLook from './TerminalLook'
import NodeIcon from './NodeIcon'
import RoleEditor, { RoleDetail } from './RoleEditor'
import { BranchIcon, CheckIcon, CloseIcon, FolderIcon, PlusIcon } from './icons'
import { TERMINAL_SIZES, terminalLook, type TerminalLook as Look } from '../nodeStyle'
import { TERMINAL_THEMES } from '../terminalThemes'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { AGENTS } from '../../../shared/agents'
import type { FolderInfo, NodeStyle, Role, SavedRole } from '../../../shared/types'

// What the dialog opens: the program and how it starts, the node's name, folder and look.
export interface LaunchChoice {
  agent?: string
  role?: string
  command?: string
  title: string
  cwd?: string
  style: NodeStyle
  isolate?: boolean
}

// What it remembers between uses.
interface Memory {
  program?: string
  roles?: Record<string, string | undefined>
  isolate?: boolean
  look?: NodeStyle
}

type Tab = 'general' | 'style' | 'role'

// The programs a new terminal can open with: the shell, then the main agents, each with the
// command that starts it. The other agent CLIs (shared/agents.js) start from a plain terminal,
// typed in it or as its command, and get the same context there.
const LISTED = ['claude', 'codex', 'gemini']
const PROGRAMS = [
  { key: 'shell', label: 'Terminal', command: '' },
  ...LISTED.map((key) => ({ key, label: AGENTS[key].label, command: AGENTS[key].command }))
]

// The other agent CLIs, for the hint under a plain terminal.
const OTHERS = Object.entries(AGENTS)
  .filter(([key]) => !LISTED.includes(key))
  .map(([, { command }]) => command)

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'style', label: 'Style' },
  { key: 'role', label: 'Role' }
]

// What the dialog remembers between uses: the program, each agent's role and the look.
const MEMORY = 'new-terminal'

const NO_ROLE: Role = {
  label: 'No role',
  description: 'Knows how Nara works: links, messages and notes.',
  none: true
}

// The dialog behind the dock's Terminal button, in three tabs: General (the program, which is the
// only choice that matters, its name, the command that starts it and the folder), Style (the
// look, with a preview) and Role (for the agent, or in a plain terminal for whichever agent CLI
// starts in it). Every tab starts filled in, so the
// terminal can open from any of them. `number` is the id the node will get, for its default name;
// `folder` is the workspace's. `roles` has every role, built-in and custom, by key; onSaveRole and
// onRemoveRole change the custom ones; `commands` has the commands set in the settings in place
// of the agents' own. onCreate gets { agent, title, cwd, role, command, style },
// with only what applies to the program.
export default function Launcher({
  number,
  folder,
  roles,
  commands = {},
  onSaveRole,
  onRemoveRole,
  onCreate,
  onClose
}: {
  number: number
  folder?: string
  roles: Record<string, Role>
  commands?: Record<string, string>
  onSaveRole: (role: Role) => Promise<SavedRole | null>
  onRemoveRole: (key: string) => Promise<unknown>
  onCreate: (choice: LaunchChoice) => void
  onClose: () => void
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [memory] = useState(recall)
  const [tab, setTab] = useState<Tab>('general')
  const [program, setProgram] = useState<string>(() =>
    memory.program && PROGRAMS.some((p) => p.key === memory.program) ? memory.program : 'shell'
  )
  const fallbackName = nodeLabel({ type: 'terminal', id: number })
  // The name and the command start as the program's. The name follows it to another program until
  // the user types their own; the command always does, since one program's makes no sense in
  // another.
  const autoName = (key: string): string => (key === 'shell' ? fallbackName : AGENTS[key].label)
  const builtInCommand = (key: string): string => PROGRAMS.find((p) => p.key === key)?.command ?? ''
  const autoCommand = (key: string): string => commands[key] || builtInCommand(key)
  const [name, setName] = useState(() => autoName(program))
  const [command, setCommand] = useState(() => autoCommand(program))
  const [cwd, setCwd] = useState(folder)
  const [info, setInfo] = useState<FolderInfo | null>(null)
  const [roleByAgent, setRoleByAgent] = useState<Record<string, string | undefined>>(
    memory.roles ?? {}
  )
  const [look, setLook] = useState<Look>(() => terminalLook(memory.look))
  // Whether an agent opens in a git worktree of its own, on a new branch.
  const [isolate, setIsolate] = useState(Boolean(memory.isolate))
  // The role being written or edited, or null.
  const [draft, setDraft] = useState<Role | null>(null)
  const [closing, setClosing] = useState(false)
  // A press that starts and ends on the backdrop closes the dialog; one that only ends there
  // (selecting text and letting go outside) doesn't.
  const pressedBackdrop = useRef(false)

  const agent = AGENTS[program]
  const chosenRole = roleByAgent[program]
  const takesRole = program === 'shell' || Boolean(agent?.prompt)
  const role = takesRole && Object.hasOwn(roles, chosenRole ?? '') ? chosenRole : undefined
  const programIndex = PROGRAMS.findIndex((p) => p.key === program)

  // The dialog takes the focus itself, so nothing inside opens with a focus ring.
  useEffect(() => {
    dialog.current?.focus()
  }, [])

  // The dialog is as tall as the tab it shows, up to the window, and glides from one height to
  // the next. The first fit happens before the dialog is painted, so it opens at its size.
  useLayoutEffect(() => {
    const el = dialog.current as HTMLDialogElement
    const inner = content.current as HTMLDivElement
    // Open before measuring: a closed dialog has no size.
    if (!el.open) el.showModal()
    function fit(): void {
      const chrome = el.offsetHeight - (body.current?.offsetHeight ?? 0)
      el.style.setProperty('--height', `${chrome + inner.offsetHeight}px`)
    }
    fit()
    const frame = requestAnimationFrame(() => (el.dataset.sized = ''))
    const observer = new ResizeObserver(fit)
    observer.observe(inner)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [tab])

  useEffect(() => {
    let current = true
    window.api.folder.info(cwd).then((next) => {
      if (current) setInfo(next)
    })
    return () => {
      current = false
    }
  }, [cwd])

  function close(): void {
    setClosing(true)
  }

  // Escape puts away the role being written first, then the dialog.
  function onCancel(e: SyntheticEvent): void {
    e.preventDefault()
    if (draft) setDraft(null)
    else close()
  }

  function create(e?: FormEvent): void {
    e?.preventDefault()
    if (closing || draft) return
    const title = name.trim()
    const typed = command.trim()
    const style = Object.fromEntries(Object.entries(look).filter(([, value]) => value != null))
    localStorage.setItem(
      MEMORY,
      JSON.stringify({
        program,
        roles: roleByAgent,
        isolate,
        look: { theme: look.theme, tone: look.tone, size: look.size, cursor: look.cursor }
      })
    )
    onCreate({
      ...(agent && { agent: program }),
      ...(role && { role }),
      // An agent's own command isn't saved, so the node follows it if Nara's default changes.
      ...(typed && typed !== builtInCommand(program) && { command: typed }),
      title: title && title !== fallbackName ? title : defaultTitle('terminal', number),
      cwd,
      style,
      ...(agent && isolate && info?.branch && { isolate: true })
    })
    close()
  }

  function pickProgram(key: string): void {
    if (!name.trim() || name === autoName(program)) setName(autoName(key))
    if (key !== program) setCommand(autoCommand(key))
    setProgram(key)
    // An icon picked for one program doesn't carry over: the next one shows its own.
    setLook((current) => ({ ...current, icon: null }))
  }

  // Left and right move between the tabs and between the programs, as in any tab list or radio
  // group.
  function cycle<K extends string>(
    e: KeyboardEvent,
    items: { key: K; disabled?: boolean }[],
    current: K,
    onPick: (key: K) => void,
    selector: (key: K) => string
  ): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const usable = items.filter((item) => !item.disabled)
    const index = usable.findIndex((item) => item.key === current)
    const next = usable[(index + (e.key === 'ArrowRight' ? 1 : usable.length - 1)) % usable.length]
    onPick(next.key)
    dialog.current?.querySelector<HTMLElement>(selector(next.key))?.focus()
  }

  async function changeFolder(): Promise<void> {
    const picked = await window.api.folder.pick(cwd)
    if (picked) setCwd(picked)
  }

  function pickRole(key: string | undefined): void {
    setDraft(null)
    setRoleByAgent((current) => ({ ...current, [program]: key }))
  }

  async function saveDraft(): Promise<void> {
    if (!draft) return
    const saved = await onSaveRole(draft)
    if (!saved) return
    pickRole(saved.key)
  }

  async function removeRole(key: string): Promise<void> {
    await onRemoveRole(key)
    pickRole(undefined)
  }

  const tabs = TABS.map((t) => ({ ...t, disabled: t.key === 'role' && !takesRole }))
  return (
    <dialog
      ref={dialog}
      className={closing ? 'launcher closing' : 'launcher'}
      tabIndex={-1}
      aria-labelledby="launcher-title"
      onCancel={onCancel}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === dialog.current
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === dialog.current) close()
      }}
      onAnimationEnd={(e) => e.animationName === 'launcher-out' && onClose()}
      // The browser can close the dialog by itself (a second Escape it won't let be held back):
      // then there's no closing animation to wait for.
      onClose={onClose}
    >
      <form className="launcher-sheet" onSubmit={create}>
        <header className="launcher-head">
          <h2 id="launcher-title">New terminal</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            title="Close"
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          className="launcher-tabs"
          role="tablist"
          aria-label="Settings"
          onKeyDown={(e) => cycle(e, tabs, tab, setTab, (key) => `#launcher-tab-${key}`)}
        >
          {tabs.map(({ key, label, disabled }) => (
            <button
              key={key}
              type="button"
              id={`launcher-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls="launcher-panel"
              tabIndex={tab === key ? 0 : -1}
              disabled={disabled}
              title={disabled ? 'This program takes no role' : undefined}
              onClick={() => setTab(key)}
            >
              {label}
              {key === 'role' && role && <span className="role-dot" data-tone={roles[role].tone} />}
            </button>
          ))}
        </div>

        {/* The key replays the fade when the tab changes. */}
        <div
          key={tab}
          ref={body}
          id="launcher-panel"
          className={`launcher-body ${tab}`}
          role="tabpanel"
          aria-labelledby={`launcher-tab-${tab}`}
        >
          <div ref={content} className="launcher-content">
            {tab === 'general' && (
              <>
                {/* One track, an icon over each name, and a chip that slides to the chosen one. */}
                <div
                  className="program-switch"
                  role="radiogroup"
                  aria-label="Type"
                  style={{ '--index': programIndex, '--count': PROGRAMS.length }}
                  onKeyDown={(e) =>
                    cycle(e, PROGRAMS, program, pickProgram, (key) => `[data-program='${key}']`)
                  }
                >
                  {PROGRAMS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      data-program={key}
                      aria-checked={program === key}
                      tabIndex={program === key ? 0 : -1}
                      onClick={() => pickProgram(key)}
                    >
                      <NodeIcon type="terminal" agent={key} size={20} />
                      {label}
                    </button>
                  ))}
                </div>
                {!agent && (
                  <p className="field-hint program-hint">
                    Any agent CLI started here, like <code>{OTHERS.slice(0, 3).join(', ')}</code>,
                    knows Nara, its links and this terminal’s role. Another CLI starts the same way
                    with <code>nara run &lt;cli&gt;</code>.
                  </p>
                )}

                <div className="field-pair">
                  <label className="field">
                    <span className="field-label">Name</span>
                    <input
                      className="text-input"
                      value={name}
                      placeholder={fallbackName}
                      maxLength={60}
                      spellCheck={false}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Command</span>
                    <span className="command-input">
                      <span className="command-prompt" aria-hidden="true">
                        ❯
                      </span>
                      <input
                        className="text-input mono"
                        value={command}
                        placeholder={agent ? agent.command : 'npm run dev'}
                        spellCheck={false}
                        title={
                          agent
                            ? `Starts ${agent.label}. Add flags or point to another binary`
                            : 'Optional. Runs as the terminal opens, then leaves you in the shell'
                        }
                        onChange={(e) => setCommand(e.target.value)}
                      />
                    </span>
                  </label>
                </div>

                <div className="field">
                  <span className="field-label">Folder</span>
                  <button type="button" className="folder-row" onClick={changeFolder}>
                    <FolderIcon />
                    <span className="folder-path" title={info?.path}>
                      {/* A long path loses its start, so the folder's own name stays in view. */}
                      <bdi>{info?.short ?? ' '}</bdi>
                    </span>
                    {info?.branch && (
                      <span className="folder-branch">
                        <BranchIcon size={12} />
                        {info.branch}
                      </span>
                    )}
                    <span className="folder-change">Change</span>
                  </button>
                  {info && !info.exists && (
                    <span className="field-hint warning">
                      Not found: it opens in your home folder
                    </span>
                  )}
                  {agent && info?.branch && (
                    <label className="isolate-row">
                      <input
                        type="checkbox"
                        role="switch"
                        className="switch"
                        checked={isolate}
                        onChange={(e) => setIsolate(e.target.checked)}
                      />
                      <span>
                        <strong>Its own worktree</strong>
                        <small>
                          A new branch off {info.branch}, in a checkout of its own: agents side by
                          side never edit the same files. Review and merge it from the inspector.
                        </small>
                      </span>
                    </label>
                  )}
                  {folder && cwd !== folder && (
                    <button type="button" className="link-button" onClick={() => setCwd(folder)}>
                      Back to the workspace’s folder
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === 'style' && (
              <>
                <Preview
                  program={program}
                  title={name.trim() || fallbackName}
                  command={command.trim()}
                  role={role ? roles[role] : undefined}
                  look={look}
                  info={info}
                />
                <TerminalLook
                  look={look}
                  agent={agent && program}
                  onChange={(change) => setLook((current) => ({ ...current, ...change }))}
                />
              </>
            )}

            {tab === 'role' && (
              <div className="role-pane">
                <div className="role-list" role="listbox" aria-label="Role">
                  {(
                    [[undefined, NO_ROLE], ...Object.entries(roles)] as [string | undefined, Role][]
                  ).map(([key, value]) => (
                    <button
                      key={key ?? 'none'}
                      type="button"
                      role="option"
                      className="role-item"
                      data-tone={value.tone}
                      aria-selected={!draft && role === key}
                      onClick={() => pickRole(key)}
                    >
                      <span className="role-dot" />
                      <span className="role-label">{value.label}</span>
                      {!draft && role === key && <CheckIcon size={13} />}
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
                    onChange={(change) =>
                      setDraft((current) => (current ? { ...current, ...change } : current))
                    }
                    onSave={saveDraft}
                    onCancel={() => setDraft(null)}
                  />
                ) : (
                  <RoleDetail
                    key={role ?? 'none'}
                    role={role ? roles[role] : NO_ROLE}
                    custom={role?.startsWith('custom-')}
                    onEdit={() => role && setDraft({ ...roles[role] })}
                    onRemove={() => role && removeRole(role)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="launcher-foot">
          <button type="submit" className="button primary" disabled={Boolean(draft)}>
            <NodeIcon type="terminal" agent={agent && program} icon={look.icon} />
            Open {PROGRAMS[programIndex].label}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

// The node as it will look on the canvas: its bar, and a few lines in its colors, size and cursor.
function Preview({
  program,
  title,
  command,
  role,
  look,
  info
}: {
  program: string
  title: string
  command: string
  role?: Role
  look: Look
  info: FolderInfo | null
}): JSX.Element {
  const theme = TERMINAL_THEMES[look.theme]
  const c = theme.colors
  const agent = AGENTS[program]
  const cursor = (
    <span className="preview-cursor" data-cursor={look.cursor} style={{ '--cursor': c.cursor }} />
  )

  return (
    <div
      className="preview-node island"
      data-scheme={theme.light ? 'light' : undefined}
      data-tone={look.tone ?? undefined}
      style={{ '--terminal': c.background, '--terminal-bar': theme.bar }}
      aria-hidden="true"
    >
      <div className="node-bar">
        <span className="node-port" />
        <NodeIcon type="terminal" agent={agent && program} icon={look.icon} className="node-icon" />
        <span className="node-title">{title}</span>
        {agent && title !== agent.label && <span className="node-agent">{agent.label}</span>}
        {role && (
          <span className="role-pill" data-tone={role.tone}>
            {role.label}
          </span>
        )}
      </div>
      <div
        className="preview-screen"
        style={{ color: c.foreground, fontSize: TERMINAL_SIZES[look.size].px }}
      >
        <div className="preview-line">
          <span style={{ color: c.blue }}>{info?.short ?? '~'}</span>
          {info?.branch && <span style={{ color: c.magenta }}> {info.branch}</span>}
        </div>
        <div className="preview-line">
          <span style={{ color: c.green }}>❯</span> {command || (agent ? agent.command : 'ls')}
        </div>
        <div className="preview-line">
          {agent ? (
            <>
              <span style={{ color: c.yellow }}>✻</span> {agent.label}
              <span style={{ color: c.brightBlack }}>
                {role ? ` · ${role.label.toLowerCase()}` : ''}
              </span>
            </>
          ) : command ? (
            <span style={{ color: c.brightBlack }}>…</span>
          ) : (
            <>
              <span style={{ color: c.blue }}>src</span> package.json{' '}
              <span style={{ color: c.green }}>run.sh</span> README.md
            </>
          )}
        </div>
        <div className="preview-line">
          <span style={{ color: agent ? c.brightBlack : c.green }}>{agent ? '>' : '❯'}</span>{' '}
          {cursor}
        </div>
      </div>
    </div>
  )
}

function recall(): Memory {
  try {
    return JSON.parse(localStorage.getItem(MEMORY) ?? 'null') ?? {}
  } catch {
    return {}
  }
}
