import type { JSX } from 'react'
import Name from './Name'
import ProjectBadge from './ProjectBadge'
import { CloseIcon, FolderPlusIcon, NewIcon, PlusIcon, TrashIcon } from './icons'
import { ago, groupByProject, type ListedWorkspace } from '../workspaceList'
import { PAPERS } from '../nodeStyle'
import { SHORTCUTS } from '../shortcuts'
import { ariaKeys } from '../tip'
import type { Project, WorkspaceSummary } from '../../../shared/types'

// Full page with every workspace as a card: one section per project, then one with the loose
// workspaces. Opening a workspace or a project from here takes the canvas back to the screen.
// `current` is the workspace that was on screen before the page opened, if any.
export default function Overview({
  projects,
  workspaces,
  current,
  onOpen,
  onOpenProject,
  onCreateWorkspace,
  onCreateProject,
  onCloseWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject
}: {
  projects: Project[]
  workspaces: ListedWorkspace[]
  current: string | null
  onOpen: (id: string) => void
  onOpenProject: (id: string) => void
  onCreateWorkspace: (projectId?: string) => void
  onCreateProject: () => void
  onCloseWorkspace: (id: string) => void
  onRemoveWorkspace: (id: string) => void
  onRenameProject: (id: string, name: string) => void
  onRemoveProject: (id: string) => void
}): JSX.Element {
  const { groups, loose } = groupByProject(projects, workspaces)
  // Cards come in one after the other, in the order they appear on the page.
  let order = 0

  function card(w: ListedWorkspace, project?: Project): JSX.Element {
    return (
      <WorkspaceCard
        key={w.id}
        {...w}
        order={order++}
        current={w.id === current}
        // Inside a project only a folder of its own is worth showing.
        folder={project && w.folder === project.folder ? null : w.folder}
        onOpen={() => onOpen(w.id)}
        onClose={() => onCloseWorkspace(w.id)}
        onRemove={() => onRemoveWorkspace(w.id)}
      />
    )
  }

  const empty = workspaces.length === 0 && projects.length === 0
  return (
    <div className="overview">
      <header className="page-header">
        <h1 className="page-title">Workspaces</h1>
        {!empty && <span className="count-pill">{workspaces.length}</span>}
        <span className="spacer" />
        <button
          className="button"
          data-tip="Add project"
          data-keys={SHORTCUTS.newProject.keys}
          data-tip-side="bottom"
          aria-keyshortcuts={ariaKeys(SHORTCUTS.newProject.keys)}
          onClick={onCreateProject}
        >
          <FolderPlusIcon />
          Add project
        </button>
        <button
          className="button primary"
          data-tip="New workspace"
          data-keys={SHORTCUTS.newWorkspace.keys}
          data-tip-side="bottom"
          aria-keyshortcuts={ariaKeys(SHORTCUTS.newWorkspace.keys)}
          onClick={() => onCreateWorkspace()}
        >
          <PlusIcon />
          New workspace
        </button>
      </header>

      <div className="overview-body">
        <div className="overview-inner">
          {groups.map(({ project, members }) => (
            <section key={project.id} className="overview-group" aria-label={project.name}>
              <div className="group-head">
                <ProjectBadge project={project} />
                <Name
                  as="h2"
                  className="group-name"
                  name={project.name}
                  onRename={(name) => onRenameProject(project.id, name)}
                />
                <Path path={project.folder} />
                <div className="group-actions">
                  <button className="button subtle" onClick={() => onOpenProject(project.id)}>
                    Open
                  </button>
                  <button className="button subtle" onClick={() => onCreateWorkspace(project.id)}>
                    <PlusIcon size={14} />
                    Workspace
                  </button>
                  {members.every((w) => !w.open) && (
                    <button
                      className="button subtle danger"
                      title="Delete project"
                      aria-label="Delete project"
                      onClick={() => onRemoveProject(project.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="cards">
                {members.map((w) => card(w, project))}
                {members.length === 0 && (
                  <div className="cards-empty">No workspaces in this project yet.</div>
                )}
              </div>
            </section>
          ))}

          {loose.length > 0 && (
            <section className="overview-group" aria-label="Without a project">
              <div className="group-head">
                <h2 className="group-name">Without a project</h2>
              </div>
              <div className="cards">{loose.map((w) => card(w))}</div>
            </section>
          )}

          {empty && (
            <div className="empty-state">
              <h2 className="empty-title">Nothing here yet</h2>
              <p className="empty-text">
                A project is a folder with any number of workspaces; a workspace is one canvas of
                terminals, agents and notes. Add a project to start, or open a single workspace.
              </p>
              <div className="empty-actions">
                <button className="button primary" onClick={onCreateProject}>
                  <FolderPlusIcon />
                  Add project
                </button>
                <button className="button" onClick={() => onCreateWorkspace()}>
                  <NewIcon />
                  New workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkspaceCard({
  name,
  folder,
  open,
  current,
  updated,
  order,
  preview,
  terminals = 0,
  notes = 0,
  onOpen,
  onClose,
  onRemove
}: Omit<ListedWorkspace, 'folder'> & {
  folder?: string | null
  current: boolean
  order: number
  onOpen: () => void
  onClose: () => void
  onRemove: () => void
}): JSX.Element {
  const contents = [terminals && plural(terminals, 'terminal'), notes && plural(notes, 'note')]
  const className = ['card', open && 'open', current && 'current']
  return (
    <article className={className.filter(Boolean).join(' ')} style={{ '--i': order }}>
      <button
        className="card-hit"
        aria-label={`Open ${name}`}
        aria-current={current ? 'true' : undefined}
        onClick={onOpen}
      />
      <Preview {...preview} />
      <div className="card-body">
        <div className="card-top">
          <span className="card-name">{name}</span>
          {open ? (
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
          )}
        </div>
        {folder !== null && <Path className="card-folder" path={folder ?? 'No folder yet'} />}
        <div className="card-meta">
          <span>{contents.filter(Boolean).join(' · ') || 'Empty canvas'}</span>
          {open ? (
            <span className="running">
              <span className="live-dot" />
              Running
            </span>
          ) : (
            <span>{ago(updated)}</span>
          )}
        </div>
      </div>
    </article>
  )
}

// Height of a node's bar in the miniature, in world units, like the real one.
const PREVIEW_BAR = 36

// The canvas in miniature: every node as a box where it sits and every link as a line between
// their centers, scaled together to fit the card.
function Preview({
  nodes = [],
  links = []
}: Partial<NonNullable<WorkspaceSummary['preview']>>): JSX.Element {
  if (nodes.length === 0) {
    return (
      <div className="card-preview" aria-hidden="true">
        <span className="preview-empty">empty</span>
      </div>
    )
  }
  const left = Math.min(...nodes.map((n) => n.x))
  const top = Math.min(...nodes.map((n) => n.y))
  const right = Math.max(...nodes.map((n) => n.x + n.w))
  const bottom = Math.max(...nodes.map((n) => n.y + n.h))
  // A margin of an eighth of the larger side keeps the boxes off the card's edges.
  const pad = Math.max(right - left, bottom - top) * 0.12
  const viewBox = [left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const center = (n: { x: number; y: number; w: number; h: number }): [number, number] => [
    n.x + n.w / 2,
    n.y + n.h / 2
  ]

  return (
    <div className="card-preview" aria-hidden="true">
      <svg viewBox={viewBox.join(' ')} preserveAspectRatio="xMidYMid meet">
        {links.map(({ from, to }, i) => {
          const a = byId.get(from)
          const b = byId.get(to)
          if (!a || !b) return null
          const [x1, y1] = center(a)
          const [x2, y2] = center(b)
          return <line key={i} className="preview-link" x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
        {nodes.map((n) =>
          n.type === 'note' ? (
            <rect
              key={n.id}
              className="preview-note"
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="6"
              style={{ fill: n.paper ? PAPERS[n.paper]?.color : undefined }}
            />
          ) : (
            <g key={n.id}>
              <rect
                className="preview-terminal"
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="12"
                vectorEffect="non-scaling-stroke"
              />
              <rect
                className="preview-bar"
                x={n.x}
                y={n.y}
                width={n.w}
                height={PREVIEW_BAR}
                rx="12"
              />
            </g>
          )
        )}
      </svg>
    </div>
  )
}

// A path that, when it doesn't fit, loses its start instead of its end: the end is the part that
// tells folders apart. rtl moves the ellipsis to the left; the inner span keeps the text in order.
function Path({ className, path }: { className?: string; path: string }): JSX.Element {
  return (
    <span className={className ? `path ${className}` : 'path'} title={path}>
      <span dir="ltr">{path}</span>
    </span>
  )
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
