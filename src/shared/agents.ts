// The AI coding agents a node can open with, instead of a plain shell, and that a plain terminal
// recognizes when one is typed in it (main/shell.js). Main runs `command` through the user's
// shell and the renderer shows `label` in the new terminal dialog and on the nodes.
//
// Every agent gets Nara's prompt (shared/prompt.js), its role included, as it starts. `context`
// says how: 'flags' for the ones Nara knows the command line of (Claude Code, Codex: main/agents.js
// builds it, and the role's model, permissions and access become flags), 'message' for the rest,
// which get it as their first message once they're up, as a paste. A role's words hold for all of
// them; its flags only for the first kind.
//
// `answers` are the keys that answer the agent's yes-or-no questions (a permission prompt) from
// the pet's command center: Claude Code picks the option by its number, Codex by its letter, and
// both take Escape as no. Agents without them get no yes and no buttons. `telemetry` marks the
// ones whose transcripts Nara reads for what they spend and do (main/telemetry.js).
export interface Agent {
  label: string
  command: string
  prompt: boolean
  context: 'flags' | 'message'
  telemetry?: boolean
  answers?: { yes: string; no: string }
}

export const AGENTS: Record<string, Agent> = {
  claude: {
    label: 'Claude Code',
    command: 'claude',
    prompt: true,
    context: 'flags',
    telemetry: true,
    answers: { yes: '1', no: '\x1b' }
  },
  codex: {
    label: 'Codex',
    command: 'codex',
    prompt: true,
    context: 'flags',
    telemetry: true,
    answers: { yes: 'y', no: '\x1b' }
  },
  gemini: { label: 'Gemini CLI', command: 'gemini', prompt: true, context: 'message' },
  opencode: { label: 'OpenCode', command: 'opencode', prompt: true, context: 'message' },
  qwen: { label: 'Qwen Code', command: 'qwen', prompt: true, context: 'message' },
  cursor: { label: 'Cursor Agent', command: 'cursor-agent', prompt: true, context: 'message' },
  copilot: { label: 'Copilot CLI', command: 'copilot', prompt: true, context: 'message' },
  aider: { label: 'Aider', command: 'aider', prompt: true, context: 'message' },
  amp: { label: 'Amp', command: 'amp', prompt: true, context: 'message' }
}

// The agent a command name starts, if it's one of them: "cursor-agent" -> "cursor".
export function agentForCommand(name: string | undefined): string | null {
  return Object.keys(AGENTS).find((key) => AGENTS[key].command === name) ?? null
}
