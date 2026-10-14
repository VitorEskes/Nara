import { useState } from 'react'
import { isRenameKey, useRename } from '../rename'
import ProjectBadge from './ProjectBadge'
import StateGlyph from './StateGlyph'
import {
  BrandMark,
  ChevronIcon,
  CloseIcon,
  FolderIcon,
  FolderPlusIcon,
  GearIcon,
  GridIcon,
  NewIcon,
  PlusIcon,
  SidebarIcon,
  TrashIcon
} from './icons'
import { ago, groupByProject } from '../workspaceList'
import { SHORTCUTS, keysLabel } from '../shortcuts'
import { ariaKeys, tip } from '../tip'

// Column on the left: the app's actions, then every project with its workspaces, then the loose
// workspaces. Clicking a workspace opens it, and clicking a project opens one of its workspaces;
// an open one stays mounted, with its terminals running, until it's closed here. Only a closed workspace can be deleted, and only a project with none open. `active` is
// the workspace on screen, if any: with the overview showing there is none. It opens into a card
// whose slot (onSlot) the workspace fills with its branch and agents (WorkspaceNav.jsx). The other
// open ones show how their agents are doing: `summaries` has each one's most urgent state and
// its count of agents. While `hidden`, the sidebar slides shut and nothing in it can take focus.
// At the bottom, the way to the settings.
export default function Sidebar({
  projects,
  workspaces,
  active,
  summaries,
  onSlot,
  overview,
  hidden,
  onHide,
  onOverview,
  onSelect,
  onOpenProject,
  onCreateProject,
  onCreateWorkspace,
  onCloseWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject,
  onSettings
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
      <WorkspaceRow
        key={w.id}
        {...w}
        active={w.id === active}
        summary={summaries.get(w.id)}
        onSlot={onSlot}
        onSelect={() => onSelect(w.id)}
        onClose={() => onCloseWorkspace(w.id)}
        onRename={(name) => onRenameWorkspace(w.id, name)}
        onRemove={() => onRemoveWorkspace(w.id)}
      />
    )
  }

  return (
    <aside className="sidebar" aria-label="Projects and workspaces" inert={hidden || undefined}>
      <div className="sidebar-inner">
        <div className="sidebar-top">
          <BrandMark />
          <span className="brand">Nara</span>
          <button
            className="icon-button"
            {...tip('Hide sidebar', SHORTCUTS.sidebar.keys, 'bottom')}
            onClick={onHide}
          >
            <SidebarIcon />
          </button>
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
            label="All workspaces"
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
          {groups.length > 0 && <h2 className="sidebar-heading">Projects</h2>}
          {groups.map(({ project, members }) => {
            const open = !collapsed.has(project.id)
            return (
              <section key={project.id}>
                <Row
                  className="project-row"
                  title={project.folder}
                  name={project.name}
                  icon={<ProjectBadge project={project} />}
                  meta={<span className="row-meta">{members.length}</span>}
                  before={
                    <button
                      className="row-toggle"
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${project.name}` : `Expand ${project.name}`}
                      onClick={() => toggle(project.id)}
                    >
                      <ChevronIcon size={14} />
                    </button>
                  }
                  actions={
                    <>
                      <button
                        className="icon-button small"
                        title="New workspace in this project"
                        aria-label="New workspace in this project"
                        onClick={() => onCreateWorkspace(project.id)}
                      >
                        <PlusIcon size={14} />
                      </button>
                      {members.every((w) => !w.open) && (
                        <button
                          className="icon-button small danger"
                          title="Delete project"
                          aria-label="Delete project"
                          onClick={() => onRemoveProject(project.id)}
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </>
                  }
                  onOpen={() => onOpenProject(project.id)}
                  onRename={(name) => onRenameProject(project.id, name)}
                />
                <div className="project-children" data-collapsed={open ? undefined : ''}>
                  <div inert={open ? undefined : true}>
                    <ul className="row-list">{members.map(item)}</ul>
                  </div>
                </div>
              </section>
            )
          })}
          {loose.length > 0 && (
            <section>
              <h2 className="sidebar-heading">Without a project</h2>
              <ul className="row-list">{loose.map(item)}</ul>
            </section>
          )}
        </div>
        <div className="sidebar-footer">
          <NavItem
            icon={<GearIcon />}
            label="Settings"
            shortcut={SHORTCUTS.settings}
            onClick={onSettings}
          />
        </div>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, shortcut, active, onClick }) {
  return (
    <button
      className={active ? 'nav-row active' : 'nav-row'}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={ariaKeys(shortcut.keys)}
      onClick={onClick}
    >
      {icon}
      <span className="row-name">{label}</span>
      <kbd aria-hidden="true">{keysLabel(shortcut)}</kbd>
    </button>
  )
}

// A line of the sidebar: one button that opens what the row stands for (double-click or F2 on it
// renames), and the buttons for what can be done to it, which show on hover or focus. `before`
// goes in front of the main button, outside it.
function Row({
  as: Tag = 'div',
  className,
  icon,
  name,
  meta,
  actions,
  before,
  current,
  title,
  onOpen,
  onRename
}) {
  const { editing, start, field } = useRename(name, onRename)
  const classes = ['row', className, current && 'active'].filter(Boolean).join(' ')
  return (
    <Tag className={classes}>
      {before}
      {editing ? (
        <div className="row-main">
          {icon}
          {field}
        </div>
      ) : (
        <button
          className="row-main"
          title={title}
          aria-current={current ? 'page' : undefined}
          onClick={onOpen}
          onDoubleClick={start}
          onKeyDown={(e) => isRenameKey(e) && start()}
        >
          {icon}
          <span className="row-name">{name}</span>
          {meta}
        </button>
      )}
      {!editing && <span className="row-actions">{actions}</span>}
    </Tag>
  )
}

// An open workspace shows how its agents are doing instead of its age (a breathing dot when none
// is running): its file is saved all the time while it runs. The one on screen opens into a card
// with the slot its own part of the sidebar goes in.
function WorkspaceRow({
  name,
  folder,
  open,
  updated,
  active,
  summary,
  onSlot,
  onSelect,
  onClose,
  onRename,
  onRemove
}) {
  const row = (
    <Row
      as={active ? 'div' : 'li'}
      className={open ? 'workspace-row open' : 'workspace-row'}
      current={active}
      title={folder}
      name={name}
      icon={<FolderIcon />}
      meta={
        <span className="row-meta">
          {!open ? (
            ago(updated)
          ) : summary ? (
            <span className="row-agents">
              <StateGlyph state={summary.state} />
              {summary.count}
            </span>
          ) : (
            <span className="live-dot" title="Running">
              <span className="sr-only">running</span>
            </span>
          )}
        </span>
      }
      actions={
        open ? (
          <button
            className="icon-button small"
            title="Close (stops its terminals; the workspace stays saved)"
            aria-label={`Close ${name}`}
            onClick={onClose}
          >
            <CloseIcon size={14} />
          </button>
        ) : (
          <button
            className="icon-button small danger"
            title="Delete"
            aria-label={`Delete ${name}`}
            onClick={onRemove}
          >
            <TrashIcon size={14} />
          </button>
        )
      }
      onOpen={onSelect}
      onRename={onRename}
    />
  )
  if (!active) return row
  return (
    <li className="workspace-card">
      {row}
      <div ref={onSlot} />
    </li>
  )
}
