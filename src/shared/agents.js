// The AI coding agents a node can open with, instead of a plain shell. Main runs `command`
// through the user's shell and the renderer shows `label` on the buttons and nodes. An agent with
// `prompt` gets Nara's prompt at launch, so it can open with a role (see roles.js).
export const AGENTS = {
  claude: { label: 'Claude Code', command: 'claude', prompt: true },
  codex: { label: 'Codex', command: 'codex' }
}
