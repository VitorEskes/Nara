// The AI coding agents a node can open with, instead of a plain shell. Main runs `command`
// through the user's shell and the renderer shows `label` on the buttons and nodes.
export const AGENTS = {
  claude: { label: 'Claude Code', command: 'claude' },
  codex: { label: 'Codex', command: 'codex' }
}
