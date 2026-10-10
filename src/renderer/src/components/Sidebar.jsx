import { useState } from 'react'
import Name from './Name'
import ProjectBadge from './ProjectBadge'
import { FolderIcon, FolderPlusIcon, GridIcon, NewIcon, PlusIcon, TrashIcon } from './icons'
import { ago, groupByProject, stop } from '../workspaceList'
import { SHORTCUTS } from '../shortcuts'

// Column on the left: the app's actions, then every project with its workspaces, then the loose
// workspaces. Clicking a workspace opens it, and clicking a project opens one of its workspaces;
// an open one stays mounted, with its terminals running, until it's closed here. Only a closed
// workspace can be deleted, and only a project with none open. `active` is the workspace on
// screen, if any: with the overview showing there is none.
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
      <div className="sidebar-top">
        <span className="brand">Nara</span>
      </div>
      <nav className="sidebar-nav">
        <NavItem
          icon={<NewIcon />}
          label="New workspace"
          shortcut={SHORTCUTS.newWorkspace}
          onClick={() => onCreateWorkspace()}
        />
        <NavItem
          icon={<GridIcon />}
          label="Workspaces"
          shortcut={SHORTCUTS.overview}
          active={overview}
          onClick={onOverview}
        />
        <NavItem
          icon={<FolderPlusIcon />}
          label="Add project"
          shortcut={SHORTCUTS.newProject}
          onClick={onCreateProject}
        />
      </nav>
      <div className="sidebar-list">
        {groups.length > 0 && <div className="sidebar-heading">Projects</div>}
        {groups.map(({ project, members }) => {
          const open = !collapsed.has(project.id)
          return (
            <section key={project.id}>
              <div
                className={open ? 'sidebar-row project-row' : 'sidebar-row project-row collapsed'}
                title={project.folder}
                onClick={() => onOpenProject(project.id)}
              >
                <ProjectBadge project={project} />
                <Name name={project.name} onRename={(name) => onRenameProject(project.id, name)} />
                <span className="row-meta">{members.length}</span>
                <button
                  className="row-button"
                  title="New workspace in this project"
                  onClick={stop(() => onCreateWorkspace(project.id))}
                >
                  <PlusIcon />
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
                <button
                  className="row-button chevron"
                  aria-expanded={open}
                  title={open ? 'Collapse' : 'Expand'}
                  onClick={stop(() => toggle(project.id))}
                >
                  ▾
                </button>
              </div>
              {open && <ul className="sidebar-items nested">{members.map(item)}</ul>}
            </section>
          )
        })}
        {loose.length > 0 && (
          <section>
            <div className="sidebar-heading">Without a project</div>
            <ul className="sidebar-items">{loose.map(item)}</ul>
          </section>
        )}
      </div>
    </aside>
  )
}

function NavItem({ icon, label, shortcut, active, onClick }) {
  return (
    <button
      className={active ? 'sidebar-row nav-row active' : 'sidebar-row nav-row'}
      aria-current={active || undefined}
      title={shortcut.keys}
      onClick={onClick}
    >
      {icon}
      <span className="row-name">{label}</span>
      <kbd>{shortcut.keys.replace('Ctrl+Shift+', '⌃⇧')}</kbd>
    </button>
  )
}

// An open workspace shows its folder icon in the accent, and no age: its file is saved all the
// time while it runs.
function WorkspaceItem({
  name,
  folder,
  open,
  updated,
  active,
  onSelect,
  onClose,
  onRename,
  onRemove
}) {
  const className = ['sidebar-row', 'workspace-row', open && 'open', active && 'active']
  return (
    <li
      className={className.filter(Boolean).join(' ')}
      aria-current={active || undefined}
      title={folder}
      onClick={onSelect}
    >
      <FolderIcon />
      <Name name={name} onRename={onRename} />
      {!open && <span className="row-meta">{ago(updated)}</span>}
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
