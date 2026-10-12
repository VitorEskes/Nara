import { useEffect, useState } from 'react'
import RoleEditor, { PromptPreview, RoleBadges } from './RoleEditor'
import TerminalLook from './TerminalLook'
import NoteFormat from './NoteFormat'
import { Group } from './fields'
import {
  ActivityIcon,
  BranchIcon,
  CheckIcon,
  ChevronIcon,
  DiffIcon,
  FolderIcon,
  GaugeIcon,
  LayoutIcon,
  LinkIcon,
  ListChecksIcon,
  LocateIcon,
  PlusIcon,
  RestartIcon,
  SlidersIcon,
  TextIcon,
  UnlinkIcon,
  UsersIcon
} from './icons'
import NodeIcon from './NodeIcon'
import ContextRing from './ContextRing'
import { terminalLook } from '../nodeStyle'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { STATE_LABELS, ago } from '../agentStatus'
import { contextShare, formatCost, formatTokens } from '../telemetry'
import { useBranch } from '../useBranch'
import { AGENTS } from '../../../shared/agents'

// Every section a node can show, each about one thing, with the icon it has on the rail.
const SECTIONS = {
  status: { label: 'Status', Icon: GaugeIcon },
  tasks: { label: 'Tasks', Icon: ListChecksIcon },
  activity: { label: 'Activity', Icon: ActivityIcon },
  changes: { label: 'Changes', Icon: DiffIcon },
  role: { label: 'Role', Icon: UsersIcon },
  format: { label: 'Format', Icon: TextIcon },
  links: { label: 'Connections', Icon: LinkIcon },
  settings: { label: 'Settings', Icon: SlidersIcon }
}

// The sections each kind of node has, in the rail's order.
function sectionsFor(node) {
  if (node.type === 'note') return ['format', 'links', 'settings']
  if (AGENTS[node.agent]) {
    return ['status', 'tasks', 'activity', 'changes', 'role', 'links', 'settings']
  }
  return ['changes', 'links', 'settings']
}

// The inspector on the right of the canvas. A rail of icons runs down its edge: the workspace at
// the top, then the selected node's sections. The pane beside it shows the one picked; minimized,
// only the rail stays. `section` is the one picked, or 'workspace'; onSection changes it.
// `nodes` and `links` are the whole canvas, for the connections; `roles` every role by key.
// `statuses` and `telemetry` are what main reports about the agents, by node id. onChange gets the
// node's fields that changed; onRestart starts its agent again. onNoteCommand sends a note an
// edit from the Format section.
export default function Inspector({
  node,
  nodes,
  links,
  roles,
  folder,
  workspace,
  statuses,
  telemetry,
  section,
  onSection,
  open,
  onToggle,
  onSaveRole,
  onChange,
  onRestart,
  onNoteCommand,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover
}) {
  const sections = node ? sectionsFor(node) : []
  const current =
    !node || section === 'workspace'
      ? 'workspace'
      : sections.includes(section)
        ? section
        : sections[0]
  const status = node && statuses.get(node.id)
  const info = node && telemetry.get(node.id)
  const connections = node ? links.filter((l) => l.from === node.id || l.to === node.id).length : 0
  // Small counts on the rail, where they say something at a glance.
  const badges = {
    tasks: info?.tasks?.length
      ? `${info.tasks.filter((t) => t.status === 'completed').length}/${info.tasks.length}`
      : null,
    links: connections || null
  }

  function pick(key) {
    onSection(key)
    if (!open) onToggle(true)
  }

  return (
    <aside
      className={open ? 'floating inspector' : 'floating inspector minimized'}
      aria-label="Inspector"
    >
      {open && (
        <div className="inspector-pane">
          <header className="inspector-head">
            {current === 'workspace' ? (
              <div className="inspector-heading">
                <span className="inspector-kicker">Workspace</span>
                <h2 className="inspector-title">{workspace?.name ?? 'Workspace'}</h2>
              </div>
            ) : (
              <div className="inspector-heading">
                <span className="inspector-kicker">
                  {nodeLabel(node)}
                  {status && status.state !== 'idle' && (
                    <span className="inspector-state" data-state={status.state}>
                      <span className="state-dot" />
                      {STATE_LABELS[status.state]}
                    </span>
                  )}
                </span>
                <h2 className="inspector-title">{SECTIONS[current].label}</h2>
              </div>
            )}
            <button
              className="icon-button small inspector-fold"
              title="Minimize (I)"
              aria-label="Minimize the inspector"
              onClick={() => onToggle(false)}
            >
              <ChevronIcon size={14} />
            </button>
          </header>

          {/* The key replays the fade when the section or the node changes. */}
          <div key={`${node?.id}:${current}`} className="inspector-body">
            {current === 'workspace' && (
              <WorkspaceSummary
                nodes={nodes}
                folder={folder}
                statuses={statuses}
                telemetry={telemetry}
                roles={roles}
                onLocate={onLocate}
              />
            )}
            {current === 'status' && <Status status={status} info={info} />}
            {current === 'tasks' && <Tasks info={info} />}
            {current === 'activity' && <Activity info={info} />}
            {current === 'changes' && <Changes key={node.id} node={node} onChange={onChange} />}
            {current === 'role' && (
              <Role
                key={node.id}
                node={node}
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
            {current === 'links' && (
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
            )}
            {current === 'settings' && <Settings node={node} onChange={onChange} />}
          </div>
        </div>
      )}

      <nav className="inspector-rail" aria-label="Sections">
        <RailButton
          label="Workspace"
          active={open && current === 'workspace'}
          onClick={() => pick('workspace')}
        >
          <LayoutIcon />
        </RailButton>
        {node && (
          <>
            <span className="rail-node" data-state={status?.state} title={nodeLabel(node)}>
              <NodeIcon type={node.type} agent={node.agent} icon={node.style?.icon} size={14} />
            </span>
            {sections.map((key) => {
              const { label, Icon } = SECTIONS[key]
              return (
                <RailButton
                  key={key}
                  label={label}
                  badge={badges[key]}
                  active={open && current === key}
                  onClick={() => pick(key)}
                >
                  <Icon />
                </RailButton>
              )
            })}
          </>
        )}
        {!open && (
          <button
            className="rail-button rail-expand"
            title="Expand (I)"
            aria-label="Expand the inspector"
            onClick={() => onToggle(true)}
          >
            <ChevronIcon size={14} />
          </button>
        )}
      </nav>
    </aside>
  )
}

function RailButton({ label, badge, active, onClick, children }) {
  return (
    <button
      className="rail-button"
      data-tip={label}
      data-tip-side="left"
      aria-label={label}
      aria-current={active || undefined}
      onClick={onClick}
    >
      {children}
      {badge && <span className="rail-badge">{badge}</span>}
    </button>
  )
}

// The workspace at a glance: its agents with what each is doing and has spent, and its notes.
function WorkspaceSummary({ nodes, folder, statuses, telemetry, roles, onLocate }) {
  const branch = useBranch(folder)
  const agents = nodes.filter((n) => n.type === 'terminal' && AGENTS[n.agent])
  const shells = nodes.filter((n) => n.type === 'terminal' && !AGENTS[n.agent])
  const notes = nodes.filter((n) => n.type === 'note')
  const usages = agents.map((a) => telemetry.get(a.id)?.usage).filter(Boolean)
  const tokens = usages.reduce((sum, u) => sum + (u.tokens ?? 0), 0)
  const cost = usages.reduce((sum, u) => sum + (u.cost ?? 0), 0)
  const busy = agents.filter((a) => statuses.get(a.id)?.state === 'working').length

  return (
    <>
      <div className="stat-grid">
        <Stat
          label="Agents"
          value={agents.length}
          detail={busy ? `${busy} working` : 'none working'}
        />
        <Stat label="Tokens" value={formatTokens(tokens)} detail={cost ? formatCost(cost) : '—'} />
      </div>

      {folder && (
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
      )}

      <Group label="Agents">
        {agents.length === 0 ? (
          <p className="inspector-empty">Open one from the dock: Claude Code or Codex.</p>
        ) : (
          <ul className="agent-list">
            {agents.map((agent) => {
              const status = statuses.get(agent.id)
              const usage = telemetry.get(agent.id)?.usage
              const role = roles[agent.role]
              return (
                <li key={agent.id}>
                  <button className="agent-item" onClick={() => onLocate(agent.id)}>
                    <span className="inspector-icon small" data-state={status?.state}>
                      <NodeIcon type="terminal" agent={agent.agent} icon={agent.style?.icon} />
                    </span>
                    <span className="agent-item-text">
                      <span className="agent-item-name">
                        {nodeLabel(agent)}
                        {role && (
                          <span className="role-pill" data-tone={role.tone}>
                            {role.label}
                          </span>
                        )}
                      </span>
                      <span className="agent-item-state" data-state={status?.state ?? 'idle'}>
                        {STATE_LABELS[status?.state ?? 'idle']}
                        {usage?.tokens > 0 && ` · ${formatTokens(usage.tokens)} tokens`}
                      </span>
                    </span>
                    {usage?.window > 0 && <ContextRing share={contextShare(usage)} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Group>

      {(notes.length > 0 || shells.length > 0) && (
        <Group label="Also here">
          <ul className="agent-list">
            {[...shells, ...notes].map((n) => (
              <li key={n.id}>
                <button className="agent-item" onClick={() => onLocate(n.id)}>
                  <span className="inspector-icon small">
                    <NodeIcon type={n.type} agent={n.agent} icon={n.style?.icon} />
                  </span>
                  <span className="agent-item-text">
                    <span className="agent-item-name">{nodeLabel(n)}</span>
                  </span>
                  <LocateIcon size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  )
}

function Stat({ label, value, detail }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  )
}

// What the agent is doing and has spent: its state, what it's on, how full its context is and
// the tokens it has gone through.
function Status({ status, info }) {
  const usage = info?.usage
  const share = contextShare(usage)
  const active = info?.tasks?.find((t) => t.status === 'in_progress')
  const state = status?.state ?? 'idle'
  return (
    <>
      <div className="agent-card" data-state={state}>
        <div className="agent-card-head">
          <span className="state-dot" />
          <span className="agent-card-state">{STATE_LABELS[state]}</span>
          {status && <span className="agent-card-ago">{ago(status.since)}</span>}
          {info?.model && <span className="agent-card-model">{modelName(info.model)}</span>}
        </div>
        {(active || info?.title) && (
          <p className="agent-card-doing">{active ? active.active || active.text : info.title}</p>
        )}
      </div>

      {!info ? (
        <p className="inspector-empty">
          What it spends shows up here once the agent starts working.
        </p>
      ) : (
        <>
          {usage?.window > 0 && (
            <div className="meter" data-level={share > 0.85 ? 'full' : share > 0.6 ? 'high' : 'ok'}>
              <div className="meter-head">
                <span>Context</span>
                <span>
                  {formatTokens(usage.context)} / {formatTokens(usage.window)} ·{' '}
                  {Math.round(share * 100)}%
                </span>
              </div>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${share * 100}%` }} />
              </div>
            </div>
          )}
          <div className="stat-grid">
            <Stat label="Tokens" value={formatTokens(usage?.tokens ?? 0)} detail="this session" />
            <Stat label="Cost" value={formatCost(usage?.cost ?? 0)} detail="at API prices" />
          </div>
          <dl className="usage-list">
            <div>
              <dt>Input</dt>
              <dd>{formatTokens(usage?.input ?? 0)}</dd>
            </div>
            <div>
              <dt>Read from cache</dt>
              <dd>{formatTokens(usage?.cacheRead ?? 0)}</dd>
            </div>
            <div>
              <dt>Written to cache</dt>
              <dd>{formatTokens(usage?.cacheWrite ?? 0)}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{formatTokens(usage?.output ?? 0)}</dd>
            </div>
          </dl>
        </>
      )}
    </>
  )
}

// The node's name, where it runs and how it looks.
function Settings({ node, onChange }) {
  const folder = node.type === 'terminal' ? node.cwd : null
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
const STATUS_MARKS = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', conflict: '!' }

// What changed in the terminal's folder since the last commit, file by file, each opening to its
// diff. A terminal in a worktree of its own can merge its branch back, or remove the worktree.
function Changes({ node, onChange }) {
  const folder = node.worktree?.path ?? node.cwd
  const [changes, setChanges] = useState(undefined)
  const [open, setOpen] = useState(null)
  const [diff, setDiff] = useState(null)
  const [notice, setNotice] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let current = true
    const read = () => window.api.git.changes(folder).then((next) => current && setChanges(next))
    read()
    const timer = setInterval(read, CHANGES_EVERY)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [folder, tick])

  useEffect(() => {
    if (!open) return
    let current = true
    const file = changes?.files.find((f) => f.path === open)
    window.api.git
      .diff(folder, open, file?.status === 'added' && file.added == null)
      .then((text) => current && setDiff(text))
    return () => {
      current = false
    }
    // The diff is read again when the file's counts change, not on every poll.
  }, [folder, open, changes?.files.find((f) => f.path === open)?.added]) // eslint-disable-line react-hooks/exhaustive-deps

  async function merge() {
    const result = await window.api.git.merge(node.worktree)
    if (result.canceled) return
    setNotice(result.ok ? { ok: `Merged into ${node.worktree.base}` } : { error: result.error })
  }

  async function remove() {
    const result = await window.api.git.removeWorktree(node.worktree)
    if (result.canceled) return
    if (result.error) return setNotice({ error: result.error })
    onChange({ worktree: undefined, cwd: node.worktree.root })
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
function Diff({ text }) {
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

// "claude-opus-5-5" reads "Opus 5.5"; anything else as it is.
function modelName(model) {
  const match = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/)
  if (!match) return model
  const [, family, major, minor] = match
  return `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

// The agent's own task list, as it keeps it: what's done, what it's on, what's next.
function Tasks({ info }) {
  const tasks = info?.tasks ?? []
  if (!tasks.length) {
    return (
      <p className="inspector-empty">
        No task list yet. Agents keep one for bigger requests; it shows up here as they plan and
        work through it.
      </p>
    )
  }
  const done = tasks.filter((t) => t.status === 'completed').length
  return (
    <>
      <div className="meter" data-level="ok">
        <div className="meter-head">
          <span>Progress</span>
          <span>
            {done} of {tasks.length}
          </span>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${(done / tasks.length) * 100}%` }} />
        </div>
      </div>
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
    </>
  )
}

// What the agent did, newest first: each tool it ran, with what it ran it on.
function Activity({ info }) {
  const entries = info?.activity ?? []
  if (!entries.length) {
    return (
      <p className="inspector-empty">
        Nothing yet. Each file read, edit and command shows up here.
      </p>
    )
  }
  return (
    <>
      {info.lines && (info.lines.added > 0 || info.lines.removed > 0) && (
        <div className="lines-changed">
          <span className="added">+{info.lines.added}</span>
          <span className="removed">−{info.lines.removed}</span>
          <span>lines changed</span>
        </div>
      )}
      <ol className="activity-list">
        {[...entries].reverse().map((entry) => (
          <li key={entry.id} className="activity" data-status={entry.status} data-kind={entry.kind}>
            <span className="activity-tool">{entry.tool}</span>
            <span className="activity-summary" title={entry.summary}>
              {entry.summary}
            </span>
            <span className="activity-time">{ago(entry.at)}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

// The role: pick one, see what it holds the agent to, write a new one in place. A new role
// restarts the agent, which picks its conversation back up.
function Role({ node, roles, onSaveRole, onChange, onRestart }) {
  const agent = AGENTS[node.agent]
  const [draft, setDraft] = useState(null)
  const role = roles[node.role]
  return (
    <>
      <div className="choices">
        {[[undefined, { label: 'No role' }], ...Object.entries(roles)].map(
          ([key, { label, tone }]) => (
            <button
              key={key ?? 'none'}
              className="choice"
              data-tone={tone}
              title={`Restarts ${agent.label}; its conversation picks up where it left off`}
              aria-pressed={node.role === key}
              onClick={() => node.role !== key && onChange({ role: key })}
            >
              <span className="role-dot" />
              {label}
              {node.role === key && <CheckIcon size={14} />}
            </button>
          )
        )}
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
          onChange={(change) => setDraft((current) => ({ ...current, ...change }))}
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
      {!draft && (
        <button className="button small restart" onClick={onRestart}>
          <RestartIcon size={14} />
          Restart {agent.label}
        </button>
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
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const connections = links
    .filter((l) => l.from === node.id || l.to === node.id)
    .map((l) => ({ link: l.id, peer: byId.get(l.from === node.id ? l.to : l.from) }))
    .filter(({ peer }) => peer)

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
function NameInput({ node, onRename }) {
  const fallback = defaultTitle(node.type, node.id)
  const label = nodeLabel(node)

  function commit(e) {
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
        if (e.key === 'Escape') e.target.value = label
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          e.target.blur()
        }
      }}
    />
  )
}
