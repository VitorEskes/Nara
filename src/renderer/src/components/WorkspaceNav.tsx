import { useState, type JSX } from 'react'
import NodeIcon from './NodeIcon'
import StateGlyph from './StateGlyph'
import { BranchIcon, ChevronIcon, DiffIcon, LocateIcon } from './icons'
import { nodeLabel } from '../nodeLabel'
import { STATE_LABELS, ago } from '../agentStatus'
import { agentDoing, contextShare, formatCost, formatTokens, modelName } from '../telemetry'
import { useBranch } from '../useBranch'
import type {
  AgentReport,
  AgentState,
  AgentStatus,
  CanvasNode,
  NodeId,
  ReviewItem,
  Worktree
} from '../../../shared/types'

// The workspace on screen, in the sidebar under its name: its branch and its agents, each with
// what it's doing. A click on an agent selects it and opens what it has spent and
// changed; another click closes it. The workspace renders this itself, into the sidebar's slot
// (Workspace.jsx), since it holds all of it.
//
// `agents` are its agent nodes, `statuses` and `telemetry` what main reports about them by node
// id, `queue` what they changed (main/review.js). `selected` is the node selected on the canvas.
export default function WorkspaceNav({
  folder,
  agents,
  statuses,
  telemetry,
  queue,
  selected,
  onSelect,
  onLocate,
  onReview
}: {
  folder?: string
  agents: CanvasNode[]
  statuses: Map<NodeId, AgentStatus>
  telemetry: Map<NodeId, AgentReport>
  queue: ReviewItem[] | null
  selected: NodeId | null
  onSelect: (id: NodeId | null) => void
  onLocate: (id: NodeId) => void
  onReview: (id: NodeId) => void
}): JSX.Element {
  const branch = useBranch(folder)
  const [folded, setFolded] = useState(false)

  return (
    <div className="ws-nav">
      {branch && (
        <div className="ws-branch" title={`On branch ${branch}`}>
          <BranchIcon size={11} />
          <span>{branch}</span>
        </div>
      )}

      {agents.length > 0 && (
        <div className="ws-agents">
          <button
            className="ws-agents-head"
            aria-expanded={!folded}
            onClick={() => setFolded((f) => !f)}
          >
            {agents.length === 1 ? '1 agent' : `${agents.length} agents`}
            <ChevronIcon size={12} />
          </button>
          {!folded && (
            <ul className="ws-agent-list">
              {agents.map((node) => (
                <AgentRow
                  key={node.id}
                  node={node}
                  status={statuses.get(node.id)}
                  info={telemetry.get(node.id)}
                  item={queue?.find((i) => i.nodeIds.includes(node.id))}
                  open={selected === node.id}
                  onToggle={() => onSelect(selected === node.id ? null : node.id)}
                  onLocate={() => onLocate(node.id)}
                  onReview={() => onReview(node.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AgentRow({
  node,
  status,
  info,
  item,
  open,
  onToggle,
  onLocate,
  onReview
}: {
  node: CanvasNode
  status?: AgentStatus
  info?: AgentReport
  item?: ReviewItem
  open: boolean
  onToggle: () => void
  onLocate: () => void
  onReview: () => void
}): JSX.Element {
  const state: AgentState | 'off' = status?.state ?? 'off'
  const doing = agentDoing(info)
  const name = nodeLabel(node)
  return (
    <li className="ws-agent" data-open={open || undefined}>
      <button
        className="ws-agent-row"
        aria-expanded={open}
        title={doing ? `${name}: ${doing}` : name}
        onClick={onToggle}
      >
        <StateGlyph state={state} />
        <NodeIcon type="terminal" agent={node.agent} icon={node.style?.icon} size={13} />
        <span className="ws-agent-text">
          <span className="ws-agent-name">{name}</span>
          {doing && <span className="ws-agent-doing">{doing}</span>}
        </span>
        {status && state !== 'idle' && <span className="ws-agent-time">{ago(status.since)}</span>}
      </button>
      {open && (
        <AgentDetail
          state={state}
          status={status}
          info={info}
          item={item}
          worktree={node.worktree}
          onLocate={onLocate}
          onReview={onReview}
        />
      )}
    </li>
  )
}

// What a selected agent is up to, spends and changed, with the ways to go to it and to its work.
function AgentDetail({
  state,
  status,
  info,
  item,
  worktree,
  onLocate,
  onReview
}: {
  state: AgentState | 'off'
  status?: AgentStatus
  info?: AgentReport
  item?: ReviewItem
  worktree?: Worktree
  onLocate: () => void
  onReview: () => void
}): JSX.Element {
  const usage = info?.usage
  const share = contextShare(usage)
  const tasks = info?.tasks ?? []
  const done = tasks.filter((t) => t.status === 'completed').length
  const doing = agentDoing(info)
  const added = item?.files.reduce((sum, f) => sum + (f.added ?? 0), 0) ?? 0
  const removed = item?.files.reduce((sum, f) => sum + (f.removed ?? 0), 0) ?? 0
  return (
    <div className="ws-detail">
      <div className="ws-detail-line">
        <span className="ws-state" data-state={state}>
          {state === 'off' ? 'Not running' : STATE_LABELS[state]}
        </span>
        {status && state !== 'idle' && <span>{ago(status.since)}</span>}
        {info?.model && <span>{modelName(info.model)}</span>}
      </div>
      {doing && <p className="ws-detail-doing">{doing}</p>}

      {tasks.length > 0 && (
        <Bar label="Tasks" value={`${done} of ${tasks.length}`} share={done / tasks.length} />
      )}
      {usage && usage.window > 0 && (
        <Bar
          label="Context"
          value={`${Math.round(share * 100)}%`}
          share={share}
          level={share > 0.85 ? 'full' : share > 0.6 ? 'high' : 'ok'}
          title={`${formatTokens(usage.context)} of ${formatTokens(usage.window)}`}
        />
      )}
      {usage && usage.tokens > 0 && (
        <div
          className="ws-detail-line"
          title={`Input ${formatTokens(usage.input ?? 0)} · cache read ${formatTokens(usage.cacheRead ?? 0)} · cache written ${formatTokens(usage.cacheWrite ?? 0)} · output ${formatTokens(usage.output ?? 0)}`}
        >
          <span>{formatTokens(usage.tokens)} tokens</span>
          <span>{formatCost(usage.cost)} at API prices</span>
        </div>
      )}
      {worktree && (
        <div className="ws-detail-line" title={worktree.path}>
          <BranchIcon size={11} />
          <span className="ws-detail-branch">{worktree.branch}</span>
        </div>
      )}

      <div className="ws-detail-actions">
        <button
          className="icon-button small"
          title="Show on the canvas"
          aria-label="Show on the canvas"
          onClick={onLocate}
        >
          <LocateIcon size={13} />
        </button>
        {item && (
          <button className="button small subtle ws-review" onClick={onReview}>
            <DiffIcon size={13} />
            Review
            <span className="added">+{added}</span>
            <span className="removed">−{removed}</span>
          </button>
        )}
      </div>
    </div>
  )
}

function Bar({
  label,
  value,
  share,
  level = 'ok',
  title
}: {
  label: string
  value: string
  share: number
  level?: string
  title?: string
}): JSX.Element {
  return (
    <div className="ws-bar" data-level={level} title={title}>
      <div className="ws-bar-head">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="ws-bar-track">
        <span style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>
    </div>
  )
}
