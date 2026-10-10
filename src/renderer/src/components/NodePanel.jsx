import TerminalLook from './TerminalLook'
import { Group, Options } from './fields'
import NodeIcon from './NodeIcon'
import { CheckIcon, CloseIcon, LinkIcon, LocateIcon, UnlinkIcon } from './icons'
import { ALIGNS, FONTS, INKS, PAPERS, SIZES, resolveStyle, terminalLook } from '../nodeStyle'
import { defaultTitle, nodeLabel } from '../nodeLabel'
import { AGENTS } from '../../../shared/agents'
import { ROLES } from '../../../shared/roles'

const TABS = [
  { key: 'config', label: 'Config' },
  { key: 'style', label: 'Style' }
]

// Side panel for the selected node, like Excalidraw's, in two tabs. Config holds the name, the
// role and the connections; Style holds a note's text style or a terminal's look. `nodes`
// and `links` are the whole canvas, for the connections. onChange gets the node's fields that
// changed, e.g. { title: 'Backend' }. onConnectStart starts pulling a string from the node, the
// same as its port on the bar does.
export default function NodePanel({
  node,
  nodes,
  links,
  tab,
  onTab,
  onChange,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover,
  onClose
}) {
  const index = TABS.findIndex((t) => t.key === tab)
  const label = nodeLabel(node)

  // Left and right move between the tabs, as in any tab list.
  function onTabKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    onTab(next.key)
    document.getElementById(`panel-tab-${next.key}`)?.focus()
  }

  return (
    <aside className="floating node-panel" aria-label={`${label} settings`}>
      <header className="panel-head">
        <NodeIcon type={node.type} agent={node.agent} icon={node.style?.icon} />
        <h2 className="panel-title">{label}</h2>
        <button
          className="icon-button small"
          title="Close (Esc)"
          aria-label="Close panel"
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </button>
      </header>

      <div
        className="segmented"
        role="tablist"
        aria-label="Settings"
        style={{ '--index': index, '--count': TABS.length }}
        onKeyDown={onTabKeyDown}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            id={`panel-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls="panel-body"
            tabIndex={tab === key ? 0 : -1}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The key replays the fade when the tab changes. */}
      <div
        key={tab}
        id="panel-body"
        className="panel-body"
        role="tabpanel"
        aria-labelledby={`panel-tab-${tab}`}
      >
        {tab === 'config' ? (
          <Config
            node={node}
            nodes={nodes}
            links={links}
            onChange={onChange}
            canConnect={canConnect}
            onConnectStart={onConnectStart}
            onDisconnect={onDisconnect}
            onLocate={onLocate}
            onPeerHover={onPeerHover}
          />
        ) : node.type === 'note' ? (
          <NoteStyle
            style={node.style}
            onChange={(change) => onChange({ style: { ...node.style, ...change } })}
          />
        ) : (
          <TerminalLook
            look={terminalLook(node.style)}
            agent={node.agent}
            onChange={(change) => onChange({ style: { ...node.style, ...change } })}
          />
        )}
      </div>
    </aside>
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

      <Group label="Text">
        <div className="panel-swatches">
          {Object.entries(INKS).map(([key, { label, color }]) => (
            <button
              key={key}
              className="swatch"
              title={label}
              aria-label={label}
              aria-pressed={current.ink === key}
              style={{ color, background: PAPERS[current.paper].color }}
              onClick={() => onChange({ ink: key })}
            >
              A
            </button>
          ))}
        </div>
      </Group>

      <Group label="Paper">
        <div className="panel-swatches">
          {Object.entries(PAPERS).map(([key, { label, color }]) => (
            <button
              key={key}
              className="swatch"
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

// The name, the role (for an agent that takes Nara's prompt) and the connections, with the
// connector that links the node to another one.
function Config({
  node,
  nodes,
  links,
  onChange,
  canConnect,
  onConnectStart,
  onDisconnect,
  onLocate,
  onPeerHover
}) {
  const agent = AGENTS[node.agent]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const connections = links
    .filter((l) => l.from === node.id || l.to === node.id)
    .map((l) => ({ link: l.id, peer: byId.get(l.from === node.id ? l.to : l.from) }))
    .filter(({ peer }) => peer)

  return (
    <>
      <label className="field">
        <span className="field-label">Name</span>
        <NameInput node={node} onRename={(title) => onChange({ title })} />
      </label>

      {agent?.prompt && (
        <Group label="Role">
          <div className="choices">
            {[[undefined, { label: 'No role' }], ...Object.entries(ROLES)].map(
              ([key, { label, tone }]) => (
                <button
                  key={key ?? 'none'}
                  className="choice"
                  data-tone={tone}
                  // Kept out of sight: the role goes into the prompt, so changing it restarts the
                  // agent, which picks its conversation back up.
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
          </div>
        </Group>
      )}

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
