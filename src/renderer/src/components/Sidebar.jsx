import { useState } from 'react'
import Name from './Name'
import { GridIcon, TrashIcon } from './icons'
import { groupByProject, stop } from '../workspaceList'

// Column on the left with every project and its workspaces, then the loose workspaces. Clicking a
// workspace opens it, and clicking a project opens one of its workspaces; an open one stays
// mounted, with its terminals running, until it's closed here. Only a closed workspace can be
// deleted, and only a project with none open. `active` is the workspace on screen, if any: with
// the overview showing there is none.
export default function Sidebar({
  projects,
  workspaces,
  active,
  overview,
  onOverview,
  onSelect,
  onOpenProject,
  onCreateProject,
  onCreateWorkspace,
  onCloseWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject
}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const { groups, loose } = groupByProject(projects, workspaces)

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
        <button
          className={overview ? 'sidebar-row overview-row active' : 'sidebar-row overview-row'}
          aria-current={overview || undefined}
          onClick={onOverview}
        >
          <GridIcon />
          All workspaces
        </button>
        {groups.map(({ project, members }) => {
          const open = !collapsed.has(project.id)
          return (
            <section key={project.id} className="sidebar-project">
              <div
                className="sidebar-row project-row"
                title={project.folder}
                onClick={() => onOpenProject(project.id)}
              >
                <button
                  className="row-button chevron"
                  aria-expanded={open}
                  title={open ? 'Collapse' : 'Expand'}
                  onClick={stop(() => toggle(project.id))}
                >
                  ▾
                </button>
                <Name name={project.name} onRename={(name) => onRenameProject(project.id, name)} />
                <button
                  className="row-button"
                  title="New workspace in this project"
                  onClick={stop(() => onCreateWorkspace(project.id))}
                >
                  +
                </button>
                {members.every((w) => !w.open) && (
                  <button
                    className="row-button danger"
                    title="Delete project"
                    onClick={stop(() => onRemoveProject(project.id))}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              {open && <ul className="sidebar-items nested">{members.map(item)}</ul>}
            </section>
          )
        })}
        {loose.length > 0 && (
          <section>
            <div className="sidebar-heading">Workspaces</div>
            <ul className="sidebar-items">{loose.map(item)}</ul>
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
          onClick={stop(onClose)}
        >
          ×
        </button>
      ) : (
        <button className="row-button danger" title="Delete" onClick={stop(onRemove)}>
          <TrashIcon />
        </button>
      )}
    </li>
  )
}
