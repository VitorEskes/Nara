import { CodeIcon, DiffIcon, NodesIcon } from './components/icons'
import { CODE_TOGGLE, REVIEW_TOGGLE } from './shortcuts'

// The views of a workspace, with the keys that switch to each: the canvas, the code and the
// review of what its agents changed. The sidebar switches between them (WorkspaceNav.jsx), and
// the top bar while the sidebar is hidden. The canvas has no key of its own: each of the others'
// switches back to it.
export const VIEWS = [
  ['canvas', 'Canvas', NodesIcon, null],
  ['code', 'Code', CodeIcon, CODE_TOGGLE.keys],
  ['review', 'Review', DiffIcon, REVIEW_TOGGLE.keys]
]
