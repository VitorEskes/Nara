// The agent CLIs a node can open with, and that a plain terminal recognizes when one is typed in
// it (main/shell.ts). Every agent gets Nara's prompt (shared/prompt.ts) as it starts, built into
// its command line by main/agents.ts. `context` says how it arrives:
// - 'system': with the agent's own instructions, for the whole session (a flag, an instructions
//   folder or config, or a read-only file kept in the chat).
// - 'first': as the message the agent starts with (Gemini CLI, Cursor Agent).
// - 'paste': pasted once the agent is up (Amp, and any CLI started with `nara run`).
//
// `enforces` lists the role settings the CLI holds itself to as flags or a policy: the model, the
// permission mode and read-only access. `answers` are the keys that answer a yes-or-no prompt from
// the pet's command center. `telemetry` marks the agents whose transcripts main/telemetry.ts reads.
export interface Agent {
  label: string
  command: string
  prompt: boolean
  context: 'system' | 'first' | 'paste'
  enforces: { model?: boolean; mode?: boolean; readOnly?: boolean }
  telemetry?: boolean
  answers?: { yes: string; no: string }
}

export const AGENTS: Record<string, Agent> = {
  claude: {
    label: 'Claude Code',
    command: 'claude',
    prompt: true,
    context: 'system',
    enforces: { model: true, mode: true, readOnly: true },
    telemetry: true,
    answers: { yes: '1', no: '\x1b' }
  },
  codex: {
    label: 'Codex',
    command: 'codex',
    prompt: true,
    context: 'system',
    enforces: { readOnly: true },
    telemetry: true,
    answers: { yes: 'y', no: '\x1b' }
  },
  gemini: {
    label: 'Gemini CLI',
    command: 'gemini',
    prompt: true,
    context: 'first',
    enforces: { mode: true, readOnly: true },
    answers: { yes: '1', no: '\x1b' }
  },
  opencode: {
    label: 'OpenCode',
    command: 'opencode',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true }
  },
  qwen: {
    label: 'Qwen Code',
    command: 'qwen',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: '1', no: '\x1b' }
  },
  cursor: {
    label: 'Cursor Agent',
    command: 'cursor-agent',
    prompt: true,
    context: 'first',
    enforces: { mode: true, readOnly: true }
  },
  copilot: {
    label: 'Copilot CLI',
    command: 'copilot',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: '1', no: '\x1b' }
  },
  aider: {
    label: 'Aider',
    command: 'aider',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: 'y\r', no: 'n\r' }
  },
  amp: { label: 'Amp', command: 'amp', prompt: true, context: 'paste', enforces: {} }
}

// The agent a command name starts, if it's one of them: "cursor-agent" -> "cursor".
export function agentForCommand(name: string | undefined): string | null {
  return Object.keys(AGENTS).find((key) => AGENTS[key].command === name) ?? null
}
