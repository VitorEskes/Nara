import {
  useEffect,
  useState,
  type FocusEvent,
  type JSX,
  type PointerEvent,
  type ReactNode
} from 'react'
import { ask } from '../dialogs'
import RoleEditor, { PromptPreview, RoleBadges } from './RoleEditor'
import TerminalLook from './TerminalLook'
import NoteFormat, { type NoteCommand } from './NoteFormat'
import { Group } from './fields'
import {
  BranchIcon,
  CheckIcon,
  FolderIcon,
  LinkIcon,
  LocateIcon,
  PlusIcon,
  RestartIcon,
  UnlinkIcon
} from './icons'
import NodeIcon from './NodeIcon'
import { terminalLook } from '../nodeStyle'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { STATE_LABELS, ago } from '../agentStatus'
import { useBranch } from '../useBranch'
import { AGENTS } from '../../../shared/agents'
import type {
  AgentReport,
  AgentStatus,
  CanvasNode,
  GitChange,
  GitChanges,
  Link,
  NodeId,
  Role as RoleData,
  SavedRole
} from '../../../shared/types'

type Section = keyof typeof SECTIONS
type ChangeNode = (changes: Partial<CanvasNode>) => void
type Notice = { ok: string; error?: undefined } | { error: string; ok?: undefined }

// What a node that isn't an agent is called, above its name.
const KINDS: Record<string, string> = { note: 'Note', browser: 'Browser', terminal: 'Terminal' }

// Every section a node can show, each about one thing.
const SECTIONS = {
  activity: 'Activity',
  changes: 'Changes',
  role: 'Role',
  format: 'Format',
  settings: 'Settings'
}

// The sections each kind of node has, in order. What an agent is doing and has spent is in the
// sidebar, by its name (WorkspaceNav.jsx); its changes are in the review. A plain terminal has a
// role too, for the agent CLIs typed in it (main/shell.js); `running` is the one there now.
function sectionsFor(node: CanvasNode, running: string | null | undefined): Section[] {
  if (node.type === 'note') return ['format', 'settings']
  if (node.type === 'browser') return ['settings']
  if ((node.agent && AGENTS[node.agent]) || running) return ['activity', 'role', 'settings']
  return ['changes', 'role', 'settings']
}

// The inspector on the right of the canvas, for the selected node: its name and state at the top,
// its sections in tabs under them. With nothing selected, the notes and terminals on the canvas
// (its agents are in the sidebar). `views` goes at its top: the workspace's views. `section` is the one picked, kept from node to node; onSection
// changes it.
// `nodes` and `links` are the whole canvas, for the connections; `roles` every role by key.
// `statuses` and `telemetry` are what main reports about the agents, by node id. onChange gets the
// node's fields that changed; onRestart starts its agent again. onNoteCommand sends a note an
// edit from the Format section.
export default function Inspector({
  node,
  nodes,
  links,
  roles,
  statuses,
  telemetry,
  section,
  onSection,
  onSaveRole,
  onChange,
  onRestart,
  onNoteCommand,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover,
  views
}: {
  node: CanvasNode | null
  nodes: CanvasNode[]
  links: Link[]
  roles: Record<string, RoleData>
  statuses: Map<NodeId, AgentStatus>
  telemetry: Map<NodeId, AgentReport>
  section: string
  onSection: (section: Section) => void
  onSaveRole: (role: RoleData) => Promise<SavedRole | null>
  onChange: ChangeNode
  onRestart: () => void
  onNoteCommand: (nodeId: NodeId, command: NoteCommand) => void
  canConnect: boolean
  onConnectStart: (e: PointerEvent<HTMLElement>) => void
  onDisconnect: (link: number) => void
  onLocate: (id: NodeId) => void
  onPeerHover: (id: NodeId | null) => void
  views: ReactNode
}): JSX.Element {
  if (!node) return <Unselected nodes={nodes} onLocate={onLocate} views={views} />
  const status = statuses.get(node.id)
  const running = node.agent && AGENTS[node.agent] ? null : status?.agent
  const sections = sectionsFor(node, running)
  const current = sections.includes(section as Section) ? (section as Section) : sections[0]
  const info = telemetry.get(node.id)
  const connections = links.filter((l) => l.from === node.id || l.to === node.id).length
  // Small counts on the tabs, where they say something at a glance.
  const counts: Partial<Record<Section, string | null>> = {
    activity: info?.tasks?.length
      ? `${info.tasks.filter((t) => t.status === 'completed').length}/${info.tasks.length}`
      : null,
    settings: connections ? `${connections} linked` : null
  }

  return (
    <aside className="floating inspector" aria-label="Inspector">
      {views}
      <div className="inspector-pane">
        <header className="inspector-head">
          <span className="inspector-icon" data-state={status?.state}>
            <NodeIcon type={node.type} agent={node.agent} icon={node.style?.icon} />
          </span>
          <div className="inspector-heading">
            <span className="inspector-kicker">
              {AGENTS[node.agent ?? running ?? '']?.label ?? KINDS[node.type] ?? 'Terminal'}
              {status && status.state !== 'idle' && (
                <span className="inspector-state" data-state={status.state}>
                  <span className="state-dot" />
                  {STATE_LABELS[status.state]}
                </span>
              )}
            </span>
            <h2 className="inspector-title">{nodeLabel(node)}</h2>
          </div>
        </header>

        <div
          className="inspector-tabs"
          role="tablist"
          aria-label="Sections"
          style={{ '--count': sections.length }}
        >
          {sections.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={current === key}
              onClick={() => onSection(key)}
            >
              {SECTIONS[key]}
              {counts[key] && <span className="tab-count">{counts[key]}</span>}
            </button>
          ))}
        </div>

        {/* The key replays the fade when the section or the node changes. */}
        <div key={`${node.id}:${current}`} className="inspector-body">
          {current === 'activity' && <Activity info={info} />}
          {current === 'changes' && <Changes key={node.id} node={node} onChange={onChange} />}
          {current === 'role' && (
            <Role
              key={node.id}
              node={node}
              running={running}
              roles={roles}
              onSaveRole={onSaveRole}
              onChange={onChange}
              onRestart={onRestart}
            />
          )}
          {current === 'format' && (
            <NoteFormat
              node={node}
              onChange={onChange}
              onCommand={(command) => onNoteCommand(node.id, command)}
            />
          )}
          {current === 'settings' && (
            <Settings node={node} onChange={onChange}>
              <Connections
                node={node}
                nodes={nodes}
                links={links}
                canConnect={canConnect}
                onConnectStart={onConnectStart}
                onDisconnect={onDisconnect}
                onLocate={onLocate}
                onPeerHover={onPeerHover}
              />
            </Settings>
          )}
        </div>
      </div>
    </aside>
  )
}

// The panel with nothing selected: how to fill it, and the notes and plain terminals on the canvas
// to go to (the agents are in the sidebar, by the workspace's name).
function Unselected({
  nodes,
  onLocate,
  views
}: {
  nodes: CanvasNode[]
  onLocate: (id: NodeId) => void
  views: ReactNode
}): JSX.Element {
  const others = nodes.filter((n) => n.type === 'note' || !AGENTS[n.agent ?? ''])
  return (
    <aside className="floating inspector" aria-label="Inspector">
      {views}
      <div className="inspector-pane">
        <header className="inspector-head">
          <div className="inspector-heading">
            <span className="inspector-kicker">Inspector</span>
            <h2 className="inspector-title">Nothing selected</h2>
          </div>
        </header>
        <div className="inspector-body">
          <p className="inspector-empty">
            Select a terminal or a note on the canvas, or an agent in the sidebar, to see what it is
            doing and change how it works.
          </p>
          {others.length > 0 && (
            <Group label="On the canvas">
              <ul className="peers">
                {others.map((n) => (
                  <li key={n.id} className="peer">
                    <NodeIcon type={n.type} agent={n.agent} icon={n.style?.icon} />
                    <span className="peer-name">{nodeLabel(n)}</span>
                    <button
                      className="icon-button small"
                      title="Show on the canvas"
                      aria-label={`Show ${nodeLabel(n)}`}
                      onClick={() => onLocate(n.id)}
                    >
                      <LocateIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </Group>
          )}
        </div>
      </div>
    </aside>
  )
}

// The node's name, where it runs, what it's linked to (`children`) and how it looks.
function Settings({
  node,
  onChange,
  children
}: {
  node: CanvasNode
  onChange: ChangeNode
  children: ReactNode
}): JSX.Element {
  const folder = node.type === 'terminal' ? node.cwd : undefined
  const branch = useBranch(folder)
  return (
    <>
      <label className="field">
        <span className="field-label">Name</span>
        <NameInput node={node} onRename={(title) => onChange({ title })} />
      </label>

      {folder && (
        <div className="field">
          <span className="field-label">Folder</span>
          <div className="inspector-row">
            <FolderIcon size={14} />
            <span className="inspector-row-text" title={folder}>
              <bdi>{folder}</bdi>
            </span>
            {branch && (
              <span className="inspector-branch">
                <BranchIcon size={11} />
                {branch}
              </span>
            )}
          </div>
        </div>
      )}

      {children}

      {node.type === 'terminal' && (
        <Group label="Appearance">
          <TerminalLook
            look={terminalLook(node.style)}
            agent={node.agent}
            onChange={(change) => onChange({ style: { ...node.style, ...change } })}
          />
        </Group>
      )}
    </>
  )
}

// How often the changes are read again while the tab is open.
const CHANGES_EVERY = 4000
const STATUS_MARKS: Record<GitChange['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  conflict: '!'
}

// What changed in the terminal's folder since the last commit, file by file, each opening to its
// diff. A terminal in a worktree of its own can merge its branch back, or remove the worktree.
function Changes({
  node,
  onChange
}: {
  node: CanvasNode
  onChange: ChangeNode
}): JSX.Element | null {
  const folder = node.worktree?.path ?? node.cwd
  // undefined until it's first read; null outside a repository.
  const [changes, setChanges] = useState<GitChanges | null | undefined>(undefined)
  const [open, setOpen] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let current = true
    const read = (): void => {
      window.api.git.changes(folder).then((next) => {
        if (current) setChanges(next)
      })
    }
    read()
    const timer = setInterval(read, CHANGES_EVERY)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [folder, tick])

  useEffect(() => {
    if (!open || !folder) return
    let current = true
    const file = changes?.files.find((f) => f.path === open)
    window.api.git
      .diff(folder, open, file?.status === 'added' && file.added == null)
      .then((text) => {
        if (current) setDiff(text)
      })
    return () => {
      current = false
    }
    // The diff is read again when the file's counts change, not on every poll.
  }, [folder, open, changes?.files.find((f) => f.path === open)?.added]) // eslint-disable-line react-hooks/exhaustive-deps

  async function merge(): Promise<void> {
    if (!node.worktree) return
    const { branch, base, root } = node.worktree
    const sure = await ask({
      title: `Merge ${branch} into ${base}?`,
      message: `In ${root}. Only what’s committed is merged; if it conflicts, the merge is undone.`,
      confirm: 'Merge'
    })
    if (!sure) return
    const result = await window.api.git.merge(node.worktree)
    setNotice(result.ok ? { ok: `Merged into ${base}` } : { error: result.error ?? '' })
  }

  async function remove(): Promise<void> {
    if (!node.worktree) return
    const { path, branch, root } = node.worktree
    const sure = await ask({
      title: 'Remove this worktree?',
      message: `${path} is deleted, along with anything not committed in it. The branch ${branch} and its commits stay.`,
      confirm: 'Remove',
      danger: true
    })
    if (!sure) return
    const result = await window.api.git.removeWorktree(node.worktree)
    if (result.error !== undefined) return setNotice({ error: result.error })
    onChange({ worktree: undefined, cwd: root })
    setNotice({ ok: 'Worktree removed; the branch is still there' })
    setTick((t) => t + 1)
  }

  if (changes === undefined) return null
  if (changes === null) {
    return <p className="inspector-empty">This folder isn’t in a git repository.</p>
  }
  const added = changes.files.reduce((sum, f) => sum + (f.added ?? 0), 0)
  const removed = changes.files.reduce((sum, f) => sum + (f.removed ?? 0), 0)

  return (
    <>
      {node.worktree && (
        <div className="worktree-card">
          <div className="worktree-head">
            <BranchIcon size={13} />
            <span className="worktree-branch">{node.worktree.branch}</span>
            <span className="worktree-base">from {node.worktree.base}</span>
          </div>
          <div className="worktree-actions">
            <button className="button small" onClick={merge}>
              Merge into {node.worktree.base}
            </button>
            <button className="button subtle danger" onClick={remove}>
              Remove worktree
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className={notice.error ? 'git-notice error' : 'git-notice'}>
          {notice.error ?? notice.ok}
        </p>
      )}

      {changes.files.length === 0 ? (
        <p className="inspector-empty">
          Nothing changed on {changes.branch} since the last commit.
        </p>
      ) : (
        <>
          <div className="lines-changed">
            <span>
              {changes.files.length} {changes.files.length === 1 ? 'file' : 'files'} on{' '}
              {changes.branch}
            </span>
            <span className="added">+{added}</span>
            <span className="removed">−{removed}</span>
          </div>
          <ul className="change-list">
            {changes.files.map((file) => {
              const slash = file.path.lastIndexOf('/')
              return (
                <li key={file.path}>
                  <button
                    className="change"
                    data-status={file.status}
                    aria-expanded={open === file.path}
                    onClick={() => {
                      setDiff(null)
                      setOpen((current) => (current === file.path ? null : file.path))
                    }}
                  >
                    <span className="change-mark">{STATUS_MARKS[file.status]}</span>
                    <span className="change-path" title={file.path}>
                      <span className="change-dir">{file.path.slice(0, slash + 1)}</span>
                      {file.path.slice(slash + 1)}
                    </span>
                    {file.added != null && <span className="added">+{file.added}</span>}
                    {file.removed != null && <span className="removed">−{file.removed}</span>}
                  </button>
                  {open === file.path && <Diff text={diff} />}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

// A unified diff, its lines colored by what they do; the file headers are left out.
function Diff({ text }: { text: string | null }): JSX.Element {
  if (text == null) return <div className="diff loading">Reading…</div>
  const lines = text
    .split('\n')
    .filter((line) => !/^(diff |index |--- |\+\+\+ |new file|deleted file)/.test(line))
  return (
    <pre className="diff">
      {lines.map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith('@@')
              ? 'hunk'
              : line.startsWith('+')
                ? 'add'
                : line.startsWith('-')
                  ? 'del'
                  : undefined
          }
        >
          {line || ' '}
        </span>
      ))}
    </pre>
  )
}

// What the agent is working through and has done: its own task list when it keeps one (for
// bigger requests), then each tool it ran, newest first, with what it ran it on.
function Activity({ info }: { info?: AgentReport }): JSX.Element {
  const tasks = info?.tasks ?? []
  const entries = info?.activity ?? []
  if (!tasks.length && !entries.length) {
    return (
      <p className="inspector-empty">
        Nothing yet. Its task list, and each file it reads or edits and each command it runs, show
        up here as it works.
      </p>
    )
  }
  const done = tasks.filter((t) => t.status === 'completed').length
  return (
    <>
      {tasks.length > 0 && (
        <Group label={`Tasks · ${done} of ${tasks.length}`}>
          <ol className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className="task" data-status={task.status}>
                <span className="task-check" aria-hidden="true">
                  {task.status === 'completed' && <CheckIcon size={11} />}
                </span>
                <span className="task-text">
                  {task.status === 'in_progress' && task.active ? task.active : task.text}
                </span>
              </li>
            ))}
          </ol>
        </Group>
      )}
      {entries.length > 0 && (
        <Group label="Recent">
          {info?.lines && (info.lines.added > 0 || info.lines.removed > 0) && (
            <div className="lines-changed">
              <span className="added">+{info.lines.added}</span>
              <span className="removed">−{info.lines.removed}</span>
              <span>lines changed</span>
            </div>
          )}
          <ol className="activity-list">
            {[...entries].reverse().map((entry) => (
              <li
                key={entry.id}
                className="activity"
                data-status={entry.status}
                data-kind={entry.kind}
              >
                <span className="activity-tool">{entry.tool}</span>
                <span className="activity-summary" title={entry.summary}>
                  {entry.summary}
                </span>
                <span className="activity-time">{ago(entry.at)}</span>
              </li>
            ))}
          </ol>
        </Group>
      )}
    </>
  )
}

// The role: pick one, see what it holds the agent to, write a new one in place. A new role
// restarts the agent, which picks its conversation back up.
// In a plain terminal the role waits for the next agent CLI typed there (`running` is the one
// there now), and nothing restarts.
function Role({
  node,
  running,
  roles,
  onSaveRole,
  onChange,
  onRestart
}: {
  node: CanvasNode
  running: string | null | undefined
  roles: Record<string, RoleData>
  onSaveRole: (role: RoleData) => Promise<SavedRole | null>
  onChange: ChangeNode
  onRestart: () => void
}): JSX.Element {
  const agent = node.agent ? AGENTS[node.agent] : undefined
  const [draft, setDraft] = useState<RoleData | null>(null)
  const later = agent
    ? `Restarts ${agent.label}; its conversation picks up where it left off`
    : 'For the next agent started in this terminal'
  const role = node.role ? roles[node.role] : undefined
  return (
    <>
      <div className="choices">
        {(
          [[undefined, { label: 'No role' }], ...Object.entries(roles)] as [
            string | undefined,
            RoleData
          ][]
        ).map(([key, { label, tone }]) => (
          <button
            key={key ?? 'none'}
            className="choice"
            data-tone={tone}
            title={later}
            aria-pressed={node.role === key}
            onClick={() => node.role !== key && onChange({ role: key })}
          >
            <span className="role-dot" />
            {label}
            {node.role === key && <CheckIcon size={14} />}
          </button>
        ))}
        {!draft && (
          <button
            className="choice new"
            onClick={() => setDraft({ label: '', instructions: '', tone: 'leaf' })}
          >
            <PlusIcon size={14} />
            New role
          </button>
        )}
      </div>
      {draft && (
        <RoleEditor
          draft={draft}
          onChange={(change) =>
            setDraft((current) => (current ? { ...current, ...change } : current))
          }
          onSave={async () => {
            const saved = await onSaveRole(draft)
            if (!saved) return
            setDraft(null)
            onChange({ role: saved.key })
          }}
          onCancel={() => setDraft(null)}
        />
      )}
      {!draft && role && (
        <div className="role-current" data-tone={role.tone}>
          {role.description && <p className="role-summary">{role.description}</p>}
          <RoleBadges role={role} />
        </div>
      )}
      {!draft && <PromptPreview role={role} nodeId={node.id} />}
      {!draft && agent && (
        <button className="button small restart" onClick={onRestart}>
          <RestartIcon size={14} />
          Restart {agent.label}
        </button>
      )}
      {!draft && !agent && (
        <p className="field-hint">
          {running
            ? `${AGENTS[running].label} is running here: the role holds from the next time it starts.`
            : `Start an agent here (${Object.values(AGENTS)
                .slice(0, 3)
                .map((a) => a.command)
                .join(', ')}…) and it starts with this role, linked to the canvas.`}
        </p>
      )}
    </>
  )
}

function Connections({
  node,
  nodes,
  links,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover
}: {
  node: CanvasNode
  nodes: CanvasNode[]
  links: Link[]
  canConnect: boolean
  onConnectStart: (e: PointerEvent<HTMLElement>) => void
  onDisconnect: (link: number) => void
  onLocate: (id: NodeId) => void
  onPeerHover: (id: NodeId | null) => void
}): JSX.Element {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const connections = links
    .filter((l) => l.from === node.id || l.to === node.id)
    .map((l) => ({ link: l.id, peer: byId.get(l.from === node.id ? l.to : l.from) }))
    .filter((c): c is { link: number; peer: CanvasNode } => Boolean(c.peer))

  return (
    <Group label="Connections">
      {connections.length > 0 && (
        <ul className="peers">
          {connections.map(({ link, peer }) => (
            <li
              key={link}
              className="peer"
              onPointerEnter={() => onPeerHover(peer.id)}
              onPointerLeave={() => onPeerHover(null)}
            >
              <NodeIcon type={peer.type} agent={peer.agent} icon={peer.style?.icon} />
              <span className="peer-name">{nodeLabel(peer)}</span>
              <span className="peer-id">#{peer.id}</span>
              <button
                className="icon-button small"
                title="Show on the canvas"
                aria-label={`Show ${nodeLabel(peer)}`}
                onClick={() => onLocate(peer.id)}
              >
                <LocateIcon size={14} />
              </button>
              <button
                className="icon-button small danger"
                title="Disconnect"
                aria-label={`Disconnect ${nodeLabel(peer)}`}
                onClick={() => {
                  onPeerHover(null)
                  onDisconnect(link)
                }}
              >
                <UnlinkIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        className="connector"
        disabled={!canConnect}
        title="Drag onto a node, or click and then pick one"
        onPointerDown={canConnect ? onConnectStart : undefined}
      >
        <span className="connector-pin">
          <LinkIcon size={14} />
        </span>
        <span className="connector-label">
          {canConnect ? 'Connect to a node' : 'Nothing else to connect'}
        </span>
      </button>
    </Group>
  )
}

// Renames on Enter or when the field loses focus; Escape puts the name back. An empty name goes
// back to the default one ("Terminal 3").
function NameInput({
  node,
  onRename
}: {
  node: CanvasNode
  onRename: (title: string) => void
}): JSX.Element {
  const fallback = defaultTitle(node.type, node.id)
  const label = nodeLabel(node)

  function commit(e: FocusEvent<HTMLInputElement>): void {
    const value = e.target.value.trim()
    const next = !value || value === nodeLabel({ ...node, title: fallback }) ? fallback : value
    if (next !== (node.title ?? fallback)) onRename(next)
    e.target.value = nodeLabel({ ...node, title: next })
  }

  return (
    <input
      // A new node, or a rename from elsewhere, starts the field over.
      key={`${node.id}:${node.title}`}
      className="text-input"
      defaultValue={label}
      placeholder={nodeLabel({ ...node, title: fallback })}
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.value = label
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.blur()
        }
      }}
    />
  )
}
