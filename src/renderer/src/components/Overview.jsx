import Name from './Name'
import { TrashIcon } from './icons'
import { groupByProject, stop } from '../workspaceList'

// Full page with every workspace as a card: one section per project, then one with the loose
// workspaces. Opening a workspace or a project from here takes the canvas back to the screen.
export default function Overview({
  projects,
  workspaces,
  onOpen,
  onOpenProject,
  onCreateProject,
  onCreateWorkspace,
  onCloseWorkspace,
  onRemoveWorkspace,
  onRenameProject,
  onRemoveProject
}) {
  const { groups, loose } = groupByProject(projects, workspaces)
  const running = workspaces.filter((w) => w.open).length

  function card(w, project) {
    return (
      <WorkspaceCard
        key={w.id}
        {...w}
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
      <div className="overview-inner">
        <header className="overview-head">
          <div>
            <h1>Workspaces</h1>
            <p>
              {plural(projects.length, 'project')} · {plural(workspaces.length, 'workspace')} ·{' '}
              {running} open
            </p>
          </div>
          <div className="overview-actions">
            <button onClick={onCreateProject}>New project</button>
            <button onClick={() => onCreateWorkspace()}>New workspace</button>
          </div>
        </header>

        {groups.map(({ project, members }) => (
          <section key={project.id} className="overview-group">
            <div className="group-head">
              <div className="group-title">
                <Name
                  className="group-name"
                  name={project.name}
                  onRename={(name) => onRenameProject(project.id, name)}
                />
                <Path className="group-folder" path={project.folder} />
              </div>
              <div className="group-actions">
                <button onClick={() => onOpenProject(project.id)}>Open</button>
                <button onClick={() => onCreateWorkspace(project.id)}>+ Workspace</button>
                {members.every((w) => !w.open) && (
                  <button
                    className="danger"
                    title="Delete project"
                    aria-label="Delete project"
                    onClick={() => onRemoveProject(project.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
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
              <div className="group-title">
                <h2 className="group-name">Without a project</h2>
              </div>
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
  terminals = 0,
  notes = 0,
  onOpen,
  onClose,
  onRemove
}) {
  const contents = [terminals && plural(terminals, 'terminal'), notes && plural(notes, 'note')]
  return (
    <article className={open ? 'card open' : 'card'} onClick={onOpen}>
      <div className="card-top">
        <span className="status" />
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
        {open && <span className="tag">Running</span>}
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
