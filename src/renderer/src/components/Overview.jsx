import Name from './Name'
import ProjectBadge from './ProjectBadge'
import { FolderIcon, PlusIcon, TrashIcon } from './icons'
import { ago, groupByProject, stop } from '../workspaceList'

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
  onCloseWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject
}) {
  const { groups, loose } = groupByProject(projects, workspaces)

  function card(w, project) {
    return (
      <WorkspaceCard
        key={w.id}
        {...w}
        current={w.id === current}
        // Inside a project only a folder of its own is worth showing.
        folder={project && w.folder === project.folder ? null : w.folder}
        onOpen={() => onOpen(w.id)}
        onClose={() => onCloseWorkspace(w.id)}
        onRemove={() => onRemoveWorkspace(w.id)}
      />
    )
  }

  return (
    <div className="overview">
      <header className="overview-bar">
        <h1>Workspaces</h1>
        <span className="count">{workspaces.length}</span>
        <button className="ghost-button" onClick={() => onCreateWorkspace()}>
          <PlusIcon />
          New workspace
        </button>
      </header>

      <div className="overview-body">
        {groups.map(({ project, members }) => (
          <section key={project.id} className="overview-group">
            <div className="group-head">
              <ProjectBadge project={project} />
              <Name
                className="group-name"
                name={project.name}
                onRename={(name) => onRenameProject(project.id, name)}
              />
              <span className="separator">·</span>
              <Path className="group-folder" path={project.folder} />
              <button className="chip" onClick={() => onOpenProject(project.id)}>
                Open
              </button>
              <button className="chip" onClick={() => onCreateWorkspace(project.id)}>
                <PlusIcon />
                Workspace
              </button>
              {members.every((w) => !w.open) && (
                <button
                  className="chip danger"
                  title="Delete project"
                  aria-label="Delete project"
                  onClick={() => onRemoveProject(project.id)}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
            <div className="cards">
              {members.map((w) => card(w, project))}
              {members.length === 0 && <div className="cards-empty">No workspaces yet</div>}
            </div>
          </section>
        ))}

        {loose.length > 0 && (
          <section className="overview-group">
            <div className="group-head">
              <h2 className="group-name">Without a project</h2>
            </div>
            <div className="cards">{loose.map((w) => card(w))}</div>
          </section>
        )}

        {workspaces.length === 0 && projects.length === 0 && (
          <div className="overview-empty">
            A project is a folder with any number of workspaces; a workspace is one canvas. Create
            one to start.
          </div>
        )}
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
  terminals = 0,
  notes = 0,
  onOpen,
  onClose,
  onRemove
}) {
  const contents = [terminals && plural(terminals, 'terminal'), notes && plural(notes, 'note')]
  const className = ['card', open && 'open', current && 'current']
  return (
    <article className={className.filter(Boolean).join(' ')} onClick={onOpen}>
      <div className="card-top">
        <FolderIcon />
        <span className="card-name">{name}</span>
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
      </div>
      {folder !== null && <Path className="card-folder" path={folder ?? 'No folder yet'} />}
      <div className="card-meta">
        <span>{contents.filter(Boolean).join(' · ') || 'Empty canvas'}</span>
        {open ? <span className="running">running</span> : <span>{ago(updated)}</span>}
      </div>
    </article>
  )
}

// A path that, when it doesn't fit, loses its start instead of its end: the end is the part that
// tells folders apart. rtl moves the ellipsis to the left; the inner span keeps the text in order.
function Path({ className, path }) {
  return (
    <span className={`path ${className}`} title={path}>
      <span dir="ltr">{path}</span>
    </span>
  )
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
