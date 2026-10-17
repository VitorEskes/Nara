import { MODELS } from './prompt'

// The agent CLIs a node can open with, and that a plain terminal recognizes when one is typed in
// it (main/shell.ts). Every agent gets Nara's prompt (shared/prompt.ts) as it starts, built into
// its command line by main/agents.ts. `context` says how it arrives:
// - 'system': with the agent's own instructions, for the whole session (a flag, an instructions
//   folder or config, or a read-only file kept in the chat).
// - 'first': as the message the agent starts with (Antigravity CLI, Cursor Agent).
// - 'paste': pasted once the agent is up (Amp, and any CLI started with `nara run`).
//
// `enforces` lists the role settings the CLI holds itself to as flags or a policy: the model, the
// permission mode and read-only access. `answers` are the keys that answer a yes-or-no prompt from
// the pet's command center. `telemetry` marks the agents whose transcripts main/telemetry.ts reads.
// `install` is where to get the CLI, for when the user's shell can't find it.
//
// `model` is how the CLI takes a model picked for its node (`nara model`, main/messages.ts): the
// flag, what its model names look like, and the command that lists them, for the agent picking.
// Claude Code takes Nara's aliases (shared/prompt.ts); the others, any name their CLI knows. Amp
// picks its model by mode.
//
// `resume` is how the CLI picks a conversation back up, `{id}` standing for the one its hooks
// reported (main/hooks.ts), when the node restarts: a new model or role, or the app reopening.
// Claude Code gets its session id from Nara instead (main/agents.ts), and Aider keeps its chat
// in a file of the node's.
export interface Agent {
  label: string
  command: string
  install: string
  prompt: boolean
  context: 'system' | 'first' | 'paste'
  enforces: { model?: boolean; mode?: boolean; readOnly?: boolean }
  telemetry?: boolean
  answers?: { yes: string; no: string }
  model?: { flag: string; names: string; list?: string }
  resume?: string[]
}

export const AGENTS: Record<string, Agent> = {
  claude: {
    label: 'Claude Code',
    command: 'claude',
    install: 'https://docs.anthropic.com/en/docs/claude-code',
    prompt: true,
    context: 'system',
    enforces: { model: true, mode: true, readOnly: true },
    telemetry: true,
    answers: { yes: '1', no: '\x1b' },
    model: { flag: '--model', names: 'opus, sonnet or haiku' }
  },
  codex: {
    label: 'Codex',
    command: 'codex',
    install: 'https://github.com/openai/codex',
    prompt: true,
    context: 'system',
    enforces: { readOnly: true },
    telemetry: true,
    answers: { yes: 'y', no: '\x1b' },
    model: { flag: '--model', names: "OpenAI's model names" },
    resume: ['resume', '{id}']
  },
  antigravity: {
    label: 'Antigravity CLI',
    command: 'agy',
    install: 'https://antigravity.google/docs/cli/install',
    prompt: true,
    context: 'first',
    enforces: { mode: true },
    model: { flag: '--model', names: 'the names Antigravity lists', list: 'agy models' },
    resume: ['--conversation', '{id}']
  },
  opencode: {
    label: 'OpenCode',
    command: 'opencode',
    install: 'https://opencode.ai/docs/cli/',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    model: {
      flag: '--model',
      names: 'provider/model, e.g. anthropic/claude-sonnet-4-6',
      list: 'opencode models'
    },
    resume: ['--session', '{id}']
  },
  qwen: {
    label: 'Qwen Code',
    command: 'qwen',
    install: 'https://github.com/QwenLM/qwen-code',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: '1', no: '\x1b' },
    model: { flag: '--model', names: "the models of the provider it's signed in to" },
    resume: ['--resume', '{id}']
  },
  cursor: {
    label: 'Cursor Agent',
    command: 'cursor-agent',
    install: 'https://cursor.com/cli',
    prompt: true,
    context: 'first',
    enforces: { mode: true, readOnly: true },
    model: {
      flag: '--model',
      names: "the slugs Cursor lists, not the models' display names",
      list: 'cursor-agent --list-models'
    },
    resume: ['--resume', '{id}']
  },
  copilot: {
    label: 'Copilot CLI',
    command: 'copilot',
    install: 'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: '1', no: '\x1b' },
    model: { flag: '--model', names: 'names like gpt-5.2 or claude-sonnet-4.6' },
    resume: ['--resume={id}']
  },
  aider: {
    label: 'Aider',
    command: 'aider',
    install: 'https://aider.chat',
    prompt: true,
    context: 'system',
    enforces: { mode: true, readOnly: true },
    answers: { yes: 'y\r', no: 'n\r' },
    model: {
      flag: '--model',
      names: 'provider/model, e.g. anthropic/claude-sonnet-4-6',
      list: 'aider --list-models <provider>/'
    }
  },
  amp: {
    label: 'Amp',
    command: 'amp',
    install: 'https://ampcode.com/manual#install',
    prompt: true,
    context: 'paste',
    enforces: {},
    model: { flag: '--mode', names: 'low, medium, high or ultra' },
    resume: ['threads', 'continue', '{id}']
  }
}

// The agent a command name starts, if it's one of them: "cursor-agent" -> "cursor".
export function agentForCommand(name: string | undefined): string | null {
  return Object.keys(AGENTS).find((key) => AGENTS[key].command === name) ?? null
}

// A model picked for a node (`nara model`), if its CLI can take it: one of Claude Code's aliases
// (shared/prompt.ts), or for the others any name on one line of plain text. Empty otherwise, and
// the node runs on its role's model or its CLI's own.
export function pickedModel(agent: string | undefined, model: string | undefined): string {
  const name = (model ?? '').trim()
  if (!name || !agent || !AGENTS[agent]?.model) return ''
  if (agent === 'claude') return Object.hasOwn(MODELS, name) ? name : ''
  return name.length <= 120 && /^[\w.:/@+=,()[\] -]+$/.test(name) ? name : ''
}
