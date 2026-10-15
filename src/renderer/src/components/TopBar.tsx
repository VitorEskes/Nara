import type { JSX } from 'react'
import ProjectBadge from './ProjectBadge'
import UsageMeter, { type Spend } from './UsageMeter'
import { BranchIcon, MicIcon, PanelRightIcon, SidebarIcon } from './icons'
import { SHORTCUTS } from '../shortcuts'
import { useBranch } from '../useBranch'
import ViewSwitch from './ViewSwitch'
import { VOICE } from '../../../shared/features'
import { tip } from '../tip'
import type { View } from '../views'
import type { Limits, NodeId, Project } from '../../../shared/types'

// What the panel on the right holds in each view.
const PANELS: Record<View, string> = { canvas: 'Inspector', code: 'Explorer', review: 'Review panel' }

// The bar across the top of a workspace: what its agents have spent, the dictation and the side
// panel's switch. Translucent, so the canvas runs on under it. Where you are is in the sidebar,
// and the views at the top of the side panel; while either is closed, the bar takes over what it
// held: the project, the workspace and the branch, or the views. `limits` are the plans' limits (main/usage.js) and `spend` what this
// workspace's agents have spent (UsageMeter.jsx). `mode` is 'canvas', 'code' or 'review',
// switched with onMode; `toReview` counts the agents' changes waiting to be reviewed.
export default function TopBar({
  workspace,
  project,
  folder,
  limits,
  spend,
  sidebarHidden,
  onShowSidebar,
  inspector,
  onInspector,
  mode,
  onMode,
  toReview,
  onLocate,
  onVoice
}: {
  workspace?: { name: string } | null
  project?: Project | null
  folder?: string
  limits: Limits | null
  spend: Spend
  sidebarHidden: boolean
  onShowSidebar: () => void
  inspector: boolean
  onInspector: () => void
  mode: View
  onMode: (mode: View) => void
  toReview: number
  onLocate: (id: NodeId) => void
  onVoice: () => void
}): JSX.Element {
  return (
    <header className="topbar">
      {sidebarHidden && (
        <>
          <button
            className="icon-button"
            {...tip('Show sidebar', SHORTCUTS.sidebar.keys, 'bottom')}
            onClick={onShowSidebar}
          >
            <SidebarIcon />
          </button>
          <Where workspace={workspace} project={project} folder={folder} />
        </>
      )}

      {!inspector && (
        <ViewSwitch mode={mode} onMode={onMode} toReview={toReview} className="topbar-views" />
      )}

      <div className="topbar-end">
        <UsageMeter limits={limits} spend={spend} onLocate={onLocate} />
        {VOICE && (
          <button
            className="icon-button"
            {...tip('Dictate to an agent', 'Ctrl+Alt+V', 'bottom')}
            onClick={onVoice}
          >
            <MicIcon />
          </button>
        )}
        <button
          className={inspector ? 'icon-button active' : 'icon-button'}
          title={PANELS[mode]}
          aria-label={PANELS[mode]}
          aria-pressed={inspector}
          onClick={onInspector}
        >
          <PanelRightIcon />
        </button>
      </div>
    </header>
  )
}

function Where({
  workspace,
  project,
  folder
}: {
  workspace?: { name: string } | null
  project?: Project | null
  folder?: string
}): JSX.Element {
  const branch = useBranch(folder)
  return (
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
  )
}
