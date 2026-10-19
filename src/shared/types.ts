// The shapes of the data that crosses between main and the renderer: what a workspace saves, what
// main reports about the agents, and what each IPC call returns (preload/index.ts).

// --- The canvas

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// x and y are the screen position of the world's origin, z the zoom.
export interface Camera {
  x: number
  y: number
  z: number
}

// Node ids are numbers, unique within a workspace: they're what `nara send` takes.
export type NodeId = number
export type NodeType = 'terminal' | 'note' | 'browser'

// The keys of a node's style (nodeStyle.ts): a note's font, size, ink, paper and alignment, a
// terminal's size, theme, tone, cursor and icon.
export type NodeStyle = Partial<Record<string, string | null>>

// An agent's git worktree of its own (main/git.ts).
export interface Worktree {
  path: string
  branch: string
  base: string
  root: string
}

// Every node is a box on the canvas; the rest of the fields belong to one type or another.
export interface CanvasNode extends Box {
  id: NodeId
  type: NodeType
  layer?: number
  title?: string
  style?: NodeStyle
  // Terminals.
  cwd?: string
  worktree?: Worktree
  agent?: string
  session?: string
  role?: string
  // The model the agent runs on instead of its role's, picked by an agent that coordinates it
  // (`nara model`, main/messages.ts).
  model?: string
  // The conversation the agent's CLI reported through its hooks, which it resumes when the node
  // restarts (main/agents.ts). Claude Code uses `session` instead.
  conversation?: string
  command?: string
  // Notes.
  text?: string
  view?: string
  // Browsers.
  url?: string
}

export interface Link {
  id: number
  from: NodeId
  to: NodeId
}

export type ShapeType =
  'rect' | 'ellipse' | 'triangle' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text'

// The keys of a shape's style (shapes.ts).
export type ShapeStyle = Partial<Record<string, string>>

// A whiteboard shape (renderer's shapes.ts).
export interface Shape extends Box {
  id: number
  type: ShapeType
  angle?: number
  style?: ShapeStyle
  text?: string
  points?: [number, number][]
  seed?: number
  // A text whose width the user set: its words wrap to it.
  fixedWidth?: boolean
}

// The code view's state, saved with the workspace.
export interface CodeState {
  mode: 'canvas' | 'code' | 'review'
  root: string | null
  tabs: string[]
  current: string | null
}

// A comment left on a line in the review, not sent yet.
export interface ReviewComment {
  id: string
  path: string
  start: number
  line: number
  snippet: string
  quote: string
  text: string
}

export interface ReviewRound {
  at: number
  comments: number
  to: NodeId
}

// What's been reviewed in one item (one repository).
export interface ReviewItemState {
  file: string | null
  viewed: Record<string, string>
  comments: ReviewComment[]
  note: string
  rounds: ReviewRound[]
  to: NodeId | null
}

// The review view's state, saved with the workspace.
export interface ReviewState {
  folder: string | null
  inline: boolean
  items: Record<string, Partial<ReviewItemState>>
}

// A workspace as main keeps it and the renderer loads it.
export interface Workspace {
  name: string
  project?: string
  folder?: string
  camera: Camera
  nodes: CanvasNode[]
  links: Link[]
  shapes: Shape[]
  code?: Partial<CodeState>
  review?: Partial<ReviewState>
}

// What the renderer sends main on every change.
export type WorkspaceLayout = Partial<Omit<Workspace, 'name' | 'project'>>

export interface Session {
  open: string[]
  active: string | null
}

export interface Project {
  id: string
  name: string
  folder: string
}

// A workspace in the lists. Main reads the rest for every saved one: how many terminals and notes
// it has, when it was saved, and the boxes and links the overview draws a miniature of it from;
// one just created doesn't have them yet.
export interface WorkspaceSummary extends NewWorkspace {
  terminals?: number
  notes?: number
  updated?: number | null
  preview?: {
    nodes: (Box & { id: NodeId; type: NodeType; paper?: string | null })[]
    links: { from: NodeId; to: NodeId }[]
  }
}

// A workspace just created.
export interface NewWorkspace {
  id: string
  name: string
  project?: string
  folder?: string
}

// --- Roles

export interface Role {
  key?: string
  label: string
  description?: string
  instructions?: string
  tone?: string
  model?: string
  mode?: string
  access?: string
  kickoff?: string
  // The new terminal dialog's "No role", which shows what every agent gets.
  none?: boolean
}

// A role as saved: it has a key.
export type SavedRole = Role & { key: string }

// --- Agents

export type AgentState = 'idle' | 'working' | 'waiting' | 'review' | 'failed'

export interface AgentStatus {
  workspaceId: string
  nodeId: NodeId
  agent: string
  state: AgentState
  since: number
  // The node's title and its workspace's name, for the pet's bubble.
  title?: string
  workspace?: string
}

export type AgentReply = { kind: 'yes' } | { kind: 'no' } | { kind: 'text'; text: string }

// --- Telemetry (main/telemetry.ts)

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  tokens: number
  cost: number
  context: number
  window: number
}

export interface AgentTask {
  id: string
  text: string
  active?: string
  status: string
}

export type ActivityKind = 'read' | 'edit' | 'run' | 'prompt' | 'other'

export interface Activity {
  id: number
  at: number
  tool: string
  kind: ActivityKind
  summary: string
  status: 'running' | 'done' | 'error'
}

export interface AgentReport {
  workspaceId: string
  nodeId: NodeId
  agent: string
  model: string | null
  title: string | null
  usage: Usage
  tasks: AgentTask[]
  activity: Activity[]
  lines: { added: number; removed: number } | null
}

export interface RemovedReport {
  workspaceId: string
  nodeId: NodeId
  removed: true
}

// --- Plan limits (main/usage.ts)

// `used` from 0 to 100, times in ms.
export interface UsageWindow {
  used: number
  resetsAt: number
  minutes?: number
}

export interface ProviderLimits {
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  updated?: number
}

export type Limits = Partial<Record<'claude' | 'codex', ProviderLimits>>

// --- Folders and git

export interface FolderInfo {
  path: string
  short: string
  exists: boolean
  branch: string | null
}

export interface GitChange {
  path: string
  status: 'added' | 'deleted' | 'renamed' | 'conflict' | 'modified'
  added: number | null
  removed: number | null
}

export interface GitChanges {
  branch: string
  files: GitChange[]
  // With an owner: how many changed files are someone else's.
  others?: number
}

// The terminal whose changes to list.
export interface ChangesOwner {
  workspaceId: string
  nodeId: NodeId
}

export type Result = { ok: true; error?: undefined } | { ok?: undefined; error: string }

// --- The code view (main/code.ts)

export type FileStatus = 'M' | 'A' | 'D' | 'U' | 'R' | 'C'

export interface CodeListing {
  files: string[]
  status: Record<string, FileStatus>
  repo: boolean
  truncated: boolean
  error?: undefined
}

export type CodeRead = { text: string; mtime: number; error?: undefined } | { error: string }

export type CodeWrite =
  | { mtime: number; conflict?: undefined; error?: undefined }
  | { conflict: true; error?: undefined }
  | { error: string; conflict?: undefined }

// --- The review queue (main/review.ts)

export interface ReviewFile {
  path: string
  status: 'M' | 'A' | 'D'
  added: number | null
  removed: number | null
  binary: boolean
  sig?: string
}

export interface ReviewItem {
  folder: string
  branch: string
  base: string | null
  baseCommit: string
  worktree: Worktree | null
  nodeIds: NodeId[]
  commits: { hash: string; subject: string }[]
  dirty: boolean
  files: ReviewFile[]
}

export type ReviewOriginal = { text: string; error?: undefined } | { error: string }

export type MergeResult =
  | { ok: true; conflict?: undefined; error?: undefined }
  | { conflict: string[]; ok?: undefined; error?: undefined }
  | { error: string; ok?: undefined; conflict?: undefined }

// --- Pets

export interface PetInfo {
  id: string
  name: string
  description: string
  source: string
}

export interface PetConfig {
  pet: string | null
  size: string
}

// --- Browser nodes

// An app shortcut pressed while a page had the keyboard.
export interface BrowserKey {
  code: string
  key: string
  shift: boolean
}

export interface AppInfo {
  version: string
  data: string
}

// Where the app's own update is (main/updates.ts). 'unsupported' is a build that can't update
// itself: macOS, which only installs signed updates, and a development run.
export type UpdateState =
  | { state: 'unsupported' | 'idle' | 'checking' | 'latest' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

// A local server a terminal of the workspace printed the address of (main/servers.ts).
export interface RunningServer {
  url: string
  nodeId: NodeId
  at: number
}

// What a click on a browser's page picked (BrowserNode.tsx's picker): enough for an agent to find
// the element in the code, and its box on the page for a screenshot of it.
export interface PickedElement {
  selector: string
  tag: string
  text: string
  html: string
  rect: { x: number; y: number; width: number; height: number }
  // The component that rendered it, where the page's framework tells (React, Vue, Svelte in dev).
  component?: string
  source?: string
}

// A message the page wrote to its console (main/browser.ts keeps the last ones of each page).
export interface ConsoleLine {
  level: 'info' | 'warning' | 'error' | 'debug'
  text: string
  source?: string
  line?: number
}
