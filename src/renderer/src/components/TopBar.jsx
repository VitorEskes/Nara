import ProjectBadge from './ProjectBadge'
import { BranchIcon, PanelRightIcon, SidebarIcon } from './icons'
import { STATE_LABELS } from '../agentStatus'
import { formatTokens } from '../telemetry'
import { SHORTCUTS } from '../shortcuts'
import { useBranch } from '../useBranch'

// The bar across the top of a canvas: where you are (the project, the workspace, the branch), how
// the agents in it are doing, what they've spent, and the inspector's switch. Translucent, so the
// canvas runs on under it. `agents` are this workspace's statuses; clicking a state goes to the
// agent that's been in it longest. `usage` is the workspace's total (telemetry.js), if any agent
// has reported one. `children` go before the inspector's switch: the zoom.
export default function TopBar({
  workspace,
  project,
  folder,
  agents,
  usage,
  sidebarHidden,
  onShowSidebar,
  inspector,
  onInspector,
  onLocate,
  children
}) {
  const branch = useBranch(folder)
  const counts = {}
  for (const agent of agents) (counts[agent.state] ??= []).push(agent)

  return (
    <header className="topbar">
      {sidebarHidden && (
        <button
          className="icon-button"
          title={`Show sidebar (${SHORTCUTS.sidebar.keys})`}
          aria-label="Show sidebar"
          onClick={onShowSidebar}
        >
          <SidebarIcon />
        </button>
      )}
      <nav className="crumbs" aria-label="Current workspace">
        {project && (
          <>
            <ProjectBadge project={project} />
            <span className="crumb">{project.name}</span>
            <span className="crumb-separator" aria-hidden="true">
              /
            </span>
          </>
        )}
        <span className="crumb current" aria-current="page">
          {workspace?.name}
        </span>
        {branch && (
          <span className="topbar-branch" title={`On branch ${branch}`}>
            <BranchIcon size={12} />
            {branch}
          </span>
        )}
      </nav>

      <div className="topbar-end">
        <div className="topbar-states" aria-label="Agents">
          {['waiting', 'failed', 'working', 'review'].map(
            (state) =>
              counts[state] && (
                <button
                  key={state}
                  className="state-pill"
                  data-state={state}
                  title={`Go to ${counts[state].length === 1 ? 'it' : 'the first one'}`}
                  onClick={() => onLocate(oldest(counts[state]).nodeId)}
                >
                  <span className="state-dot" />
                  {counts[state].length} {STATE_LABELS[state].toLowerCase()}
                </button>
              )
          )}
          {agents.length > 0 && !agents.some((a) => a.state !== 'idle') && (
            <span className="state-pill quiet">
              <span className="state-dot" data-state="idle" />
              {agents.length === 1 ? '1 agent' : `${agents.length} agents`}, all quiet
            </span>
          )}
        </div>
        {usage?.tokens > 0 && (
          <span
            className="topbar-usage"
            title={`${usage.tokens.toLocaleString()} tokens across this workspace's agents`}
          >
            {formatTokens(usage.tokens)} tokens
            {usage.cost > 0 && <span className="topbar-cost">${usage.cost.toFixed(2)}</span>}
          </span>
        )}
        {children}
        <button
          className={inspector ? 'icon-button active' : 'icon-button'}
          title="Inspector (I)"
          aria-label="Inspector"
          aria-pressed={inspector}
          onClick={onInspector}
        >
          <PanelRightIcon />
        </button>
      </div>
    </header>
  )
}

function oldest(agents) {
  return agents.reduce((a, b) => (b.since < a.since ? b : a))
}
