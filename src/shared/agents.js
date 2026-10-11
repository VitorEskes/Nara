// The AI coding agents a node can open with, instead of a plain shell. Main runs `command`
// through the user's shell and the renderer shows `label` in the new terminal dialog and on the
// nodes. An agent with `prompt` gets Nara's prompt at launch, so it can open with a role (see
// roles.js). `answers` are the keys that answer the agent's yes-or-no questions (a permission
// prompt) from the pet's command center: Claude Code picks the option by its number, Codex by its
// letter, and both take Escape as no.
export const AGENTS = {
  claude: {
    label: 'Claude Code',
    command: 'claude',
    prompt: true,
    answers: { yes: '1', no: '\x1b' }
  },
  codex: { label: 'Codex', command: 'codex', answers: { yes: 'y', no: '\x1b' } }
}
