import { useState } from 'react'

// Column on the left with every project and its workspaces, then the loose workspaces. Clicking a
// workspace opens it; an open one stays mounted, with its terminals running, until it's closed
// here. Only a closed workspace can be deleted, and only a project with none open.
export default function Sidebar({
  projects,
  workspaces,
  active,
  onSelect,
  onCreateProject,
  onCreateWorkspace,
  onCloseWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject
}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  // A workspace whose project is gone shows up as a loose one.
  const projectIds = new Set(projects.map((p) => p.id))
  const loose = workspaces.filter((w) => !projectIds.has(w.project))

  function toggle(id) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function item(w) {
    return (
      <WorkspaceItem
        key={w.id}
        {...w}
        active={w.id === active}
        onSelect={() => onSelect(w.id)}
        onClose={() => onCloseWorkspace(w.id)}
        onRename={(name) => onRenameWorkspace(w.id, name)}
        onRemove={() => onRemoveWorkspace(w.id)}
      />
    )
  }

  return (
    <aside className="sidebar">
      <span className="brand">anbu</span>
      <div className="sidebar-actions">
        <button onClick={onCreateProject}>New project</button>
        <button onClick={() => onCreateWorkspace()}>New workspace</button>
      </div>
      <nav className="sidebar-list">
        {byName(projects).map((project) => {
          const members = workspaces.filter((w) => w.project === project.id)
          const open = !collapsed.has(project.id)
          return (
            <section key={project.id} className="sidebar-project">
              <div className="sidebar-row project-row" title={project.folder}>
                <button
                  className="row-button chevron"
                  aria-expanded={open}
                  title={open ? 'Collapse' : 'Expand'}
                  onClick={() => toggle(project.id)}
                >
                  ▾
                </button>
                <Name name={project.name} onRename={(name) => onRenameProject(project.id, name)} />
                <button
                  className="row-button"
                  title="New workspace in this project"
                  onClick={() => onCreateWorkspace(project.id)}
                >
                  +
                </button>
                {members.every((w) => !w.open) && (
                  <button
                    className="row-button danger"
                    title="Delete project"
                    onClick={() => onRemoveProject(project.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              {open && <ul className="sidebar-items nested">{byName(members).map(item)}</ul>}
            </section>
          )
        })}
        {loose.length > 0 && (
          <section>
            <div className="sidebar-heading">Workspaces</div>
            <ul className="sidebar-items">{byName(loose).map(item)}</ul>
          </section>
        )}
      </nav>
    </aside>
  )
}

function WorkspaceItem({ name, folder, open, active, onSelect, onClose, onRename, onRemove }) {
  const className = ['sidebar-row', 'workspace-row', open && 'open', active && 'active']
  return (
    <li
      className={className.filter(Boolean).join(' ')}
      aria-current={active || undefined}
      title={folder}
      onClick={onSelect}
    >
      <span className="status" />
      <Name name={name} onRename={onRename} />
      {open ? (
        <button
          className="row-button"
          title="Close (stops its terminals; the workspace stays saved)"
          onClick={(e) => {
            // Otherwise the click also reaches the row and opens the workspace again.
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      ) : (
        <button
          className="row-button danger"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <TrashIcon />
        </button>
      )}
    </li>
  )
}

// A name that turns into a text field on double-click.
function Name({ name, onRename }) {
  const [editing, setEditing] = useState(false)

  function finish(value) {
    setEditing(false)
    const next = value.trim()
    if (next && next !== name) onRename(next)
  }

  if (!editing) {
    return (
      <span
        className="row-name"
        title="Double-click to rename"
        onDoubleClick={() => setEditing(true)}
      >
        {name}
      </span>
    )
  }
  return (
    <input
      className="row-name"
      defaultValue={name}
      autoFocus
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.target.value = name
        if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
      }}
    />
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function byName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}
