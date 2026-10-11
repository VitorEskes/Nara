import { useState } from 'react'
import RoleEditor, { PromptPreview, RoleBadges } from './RoleEditor'
import TerminalLook from './TerminalLook'
import { Group, Options } from './fields'
import {
  BranchIcon,
  CheckIcon,
  CloseIcon,
  FolderIcon,
  LinkIcon,
  LocateIcon,
  PlusIcon,
  RestartIcon,
  UnlinkIcon
} from './icons'
import NodeIcon from './NodeIcon'
import ContextRing from './ContextRing'
import {
  ALIGNS,
  FONTS,
  INKS,
  PAPERS,
  SIZES,
  inkColor,
  resolveStyle,
  terminalLook
} from '../nodeStyle'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { STATE_LABELS, ago } from '../agentStatus'
import { contextShare, formatCost, formatTokens } from '../telemetry'
import { useBranch } from '../useBranch'
import { AGENTS } from '../../../shared/agents'

// The tabs each kind of node has. An agent's are the most: what it's doing and has spent, its
// task list, what it did, its role and its look.
function tabsFor(node) {
  if (node.type === 'note') return ['overview', 'format']
  if (AGENTS[node.agent]) return ['overview', 'tasks', 'activity', 'role', 'look']
  return ['overview', 'look']
}

const TAB_LABELS = {
  overview: 'Overview',
  tasks: 'Tasks',
  activity: 'Activity',
  role: 'Role',
  look: 'Look',
  format: 'Format'
}

// The inspector on the right of the canvas: everything about the selected node, in tabs, or, with
// nothing selected, the workspace at a glance. `nodes` and `links` are the whole canvas, for the
// connections; `roles` every role by key. `statuses` and `telemetry` are what main reports about
// the agents, by node id. onChange gets the node's fields that changed; onRestart starts its
// agent again.
export default function Inspector({
  node,
  nodes,
  links,
  roles,
  folder,
  workspace,
  statuses,
  telemetry,
  onSaveRole,
  tab,
  onTab,
  onChange,
  onRestart,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover,
  onClose
}) {
  if (!node) {
    return (
      <aside className="floating inspector" aria-label="Workspace">
        <header className="inspector-head">
          <div className="inspector-heading">
            <span className="inspector-kicker">Workspace</span>
            <h2 className="inspector-title">{workspace?.name ?? 'Workspace'}</h2>
          </div>
          <CloseButton onClose={onClose} />
        </header>
        <div className="inspector-body" key="workspace">
          <WorkspaceSummary
            nodes={nodes}
            folder={folder}
            statuses={statuses}
            telemetry={telemetry}
            roles={roles}
            onLocate={onLocate}
          />
        </div>
      </aside>
    )
  }

  const tabs = tabsFor(node)
  const current = tabs.includes(tab) ? tab : tabs[0]
  const index = tabs.indexOf(current)
  const label = nodeLabel(node)
  const agent = AGENTS[node.agent]
  const status = statuses.get(node.id)
  const info = telemetry.get(node.id)

  // Left and right move between the tabs, as in any tab list.
  function onTabKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onTab(next)
    document.getElementById(`inspector-tab-${next}`)?.focus()
  }

  return (
    <aside className="floating inspector" aria-label={`${label} settings`}>
      <header className="inspector-head">
        <span className="inspector-icon" data-state={status?.state}>
          <NodeIcon type={node.type} agent={node.agent} icon={node.style?.icon} size={16} />
        </span>
        <div className="inspector-heading">
          <span className="inspector-kicker">
            {node.type === 'note' ? 'Note' : (agent?.label ?? 'Terminal')} · #{node.id}
          </span>
          <h2 className="inspector-title">{label}</h2>
        </div>
        <CloseButton onClose={onClose} />
      </header>

      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Sections"
        style={{ '--index': index, '--count': tabs.length }}
        onKeyDown={onTabKeyDown}
      >
        {tabs.map((key) => (
          <button
            key={key}
            id={`inspector-tab-${key}`}
            role="tab"
            aria-selected={current === key}
            aria-controls="inspector-body"
            tabIndex={current === key ? 0 : -1}
            onClick={() => onTab(key)}
          >
            {TAB_LABELS[key]}
            {key === 'tasks' && info?.tasks?.length > 0 && (
              <span className="tab-count">
                {info.tasks.filter((t) => t.status === 'completed').length}/{info.tasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* The key replays the fade when the tab or the node changes. */}
      <div
        key={`${node.id}:${current}`}
        id="inspector-body"
        className="inspector-body"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${current}`}
      >
        {current === 'overview' && (
          <Overview
            node={node}
            nodes={nodes}
            links={links}
            status={status}
            info={info}
            onChange={onChange}
            canConnect={canConnect}
            onConnectStart={onConnectStart}
            onDisconnect={onDisconnect}
            onLocate={onLocate}
            onPeerHover={onPeerHover}
          />
        )}
        {current === 'tasks' && <Tasks info={info} />}
        {current === 'activity' && <Activity info={info} />}
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
        {current === 'look' && (
          <TerminalLook
            look={terminalLook(node.style)}
            agent={node.agent}
            onChange={(change) => onChange({ style: { ...node.style, ...change } })}
          />
        )}
        {current === 'format' && (
          <NoteStyle
            style={node.style}
            onChange={(change) => onChange({ style: { ...node.style, ...change } })}
          />
        )}
      </div>
    </aside>
  )
}

function CloseButton({ onClose }) {
  return (
    <button
      className="icon-button small"
      title="Hide the inspector (I)"
      aria-label="Hide the inspector"
      onClick={onClose}
    >
      <CloseIcon size={14} />
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

// The node's name, what it runs and where, what its agent is doing and has spent, and its
// connections.
function Overview({
  node,
  nodes,
  links,
  status,
  info,
  onChange,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover
}) {
  const agent = AGENTS[node.agent]
  const branch = useBranch(node.type === 'terminal' ? node.cwd : null)
  const usage = info?.usage
  const share = contextShare(usage)
  const active = info?.tasks?.find((t) => t.status === 'in_progress')

  return (
    <>
      {agent && (
        <div className="agent-card" data-state={status?.state ?? 'idle'}>
          <div className="agent-card-head">
            <span className="state-dot" />
            <span className="agent-card-state">{STATE_LABELS[status?.state ?? 'idle']}</span>
            {status && <span className="agent-card-ago">{ago(status.since)}</span>}
            {info?.model && <span className="agent-card-model">{modelName(info.model)}</span>}
          </div>
          {(active || info?.title) && (
            <p className="agent-card-doing">{active ? active.active || active.text : info.title}</p>
          )}
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
          {usage?.tokens > 0 && (
            <dl className="usage-grid">
              <div>
                <dt>Input</dt>
                <dd>{formatTokens(usage.input + usage.cacheRead + usage.cacheWrite)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{formatTokens(usage.output)}</dd>
              </div>
              <div>
                <dt>Cached</dt>
                <dd>{formatTokens(usage.cacheRead)}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd title="At API prices; a subscription doesn't bill this">
                  {formatCost(usage.cost)}
                </dd>
              </div>
            </dl>
          )}
          {!info && (
            <p className="agent-card-note">
              Tokens, tasks and activity show up here once the agent starts working.
            </p>
          )}
        </div>
      )}

      <label className="field">
        <span className="field-label">Name</span>
        <NameInput node={node} onRename={(title) => onChange({ title })} />
      </label>

      {node.type === 'terminal' && node.cwd && (
        <div className="field">
          <span className="field-label">Folder</span>
          <div className="inspector-row">
            <FolderIcon size={14} />
            <span className="inspector-row-text" title={node.cwd}>
              <bdi>{node.cwd}</bdi>
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
    </>
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

// A note's font, size, colors and alignment. onChange gets only the key that changed.
function NoteStyle({ style, onChange }) {
  const current = resolveStyle(style)
  return (
    <>
      <Group label="Font">
        <div className="panel-options">
          {Object.entries(FONTS).map(([key, { label, family }]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              aria-pressed={current.font === key}
              style={{ fontFamily: family }}
              onClick={() => onChange({ font: key })}
            >
              Aa
            </button>
          ))}
        </div>
      </Group>

      <Group label="Size">
        <Options options={SIZES} value={current.size} onPick={(size) => onChange({ size })} />
      </Group>

      <Group label="Paper">
        <div className="panel-swatches">
          {Object.entries(PAPERS).map(([key, { label, color }]) => (
            <button
              key={key}
              className="swatch"
              data-dark={PAPERS[key].dark || undefined}
              title={label}
              aria-label={label}
              aria-pressed={current.paper === key}
              style={{ background: color }}
              onClick={() => onChange({ paper: key })}
            >
              {current.paper === key && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Text">
        <div className="panel-swatches">
          {Object.entries(INKS).map(([key, { label }]) => (
            <button
              key={key}
              className="swatch"
              title={label}
              aria-label={label}
              aria-pressed={current.ink === key}
              style={{
                color: inkColor(key, current.paper),
                background: PAPERS[current.paper].color
              }}
              onClick={() => onChange({ ink: key })}
            >
              A
            </button>
          ))}
        </div>
      </Group>

      <Group label="Align">
        <div className="panel-options">
          {Object.entries(ALIGNS).map(([key, { label }]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              aria-pressed={current.align === key}
              onClick={() => onChange({ align: key })}
            >
              <AlignIcon align={key} />
            </button>
          ))}
        </div>
      </Group>
    </>
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

// Three lines of text, lined up the way the button aligns them.
function AlignIcon({ align }) {
  const lines = [14, 8, 11].map((width, i) => {
    const x = align === 'left' ? 2 : align === 'right' ? 16 - 2 - width : (16 - width) / 2
    return <path key={i} d={`M${x} ${4 + i * 4} h${width}`} />
  })
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {lines}
      </g>
    </svg>
  )
}
