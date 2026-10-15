import { randomUUID } from 'crypto'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { AGENTS } from '../shared/agents'
import { EDIT_TOOLS, agentPrompt, roleProfile } from '../shared/prompt'
import { findRole } from './roles'
import type { NodeId, Worktree } from '../shared/types'

// Claude Code's hooks, as its --settings takes them (pty.ts).
export type Hooks = Record<string, { hooks: { type: string; command: string }[] }[]>

// What an agent starts with: its role, its node, and where it runs.
export interface AgentOptions {
  agent: string
  role?: string
  nodeId: NodeId
  worktree?: Pick<Worktree, 'branch' | 'base'> | null
  cwd?: string
  hooks?: Hooks | false
}

// An argument is a word, or { env } for the value of one of the variables.
type Arg = string | { env: string }
type Env = Record<string, string>

export interface Launch {
  command: string
  env: Env
  message?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// How to open an agent in a node: the shell command, plus the variables it needs in its
// environment. Claude Code runs under a session id that Nara picked and saved with the node, so
// after a restart the node picks its conversation back up instead of starting over. `command` is
// the one the user typed in the new terminal dialog in place of the agent's own (`claude --model
// opus`, a path): it's their command line, run as if they had typed it, with Nara's flags after it.
//
// Free text (the prompt, the first message, the hooks) goes through the environment and the shell
// expands each as a single argument, so it never has to be quoted into the command line. The
// rest comes from fixed lists (shared/prompt.js) and goes in as it is. An agent that takes its
// context as a message gets it back as `message`, for main to paste once it's up (pty.js).
export function agentLaunch({
  agent,
  command: typed,
  session,
  ...options
}: AgentOptions & { command?: string; session?: string }): Launch {
  const command = typeof typed === 'string' && typed.trim() ? typed.trim() : AGENTS[agent].command
  const resuming = agent === 'claude' && !!session && UUID.test(session) && hasConversation(session)
  const parts = agentParts({ agent, session, resuming, ...options })
  const words = parts.args.map((arg) => (typeof arg === 'string' ? arg : `"$${arg.env}"`))
  return { command: [command, ...words].join(' '), env: parts.env, message: parts.message }
}

// The same for an agent typed in a plain terminal (`nara run`, main/shell.js): the arguments as
// they are, to go before the user's own, which win where they say the same thing. Claude Code gets
// a session id of its own unless the user picked one (or a conversation to resume), so what it
// does and spends shows up like an agent node's. The role's first message only goes in when the
// user typed nothing after the command.
export function agentRun({
  agent,
  args: typed = [],
  ...options
}: AgentOptions & { args?: string[] }): {
  args: string[]
  env: Env
  message: string | null
  session: string | undefined
} {
  const own = typed.some((arg) => SESSION_FLAGS.has(arg.split('=')[0]))
  const session = agent === 'claude' && !own ? randomUUID() : undefined
  const parts = agentParts({ agent, session, resuming: false, quiet: typed.length > 0, ...options })
  const args = parts.args.map((arg) => (typeof arg === 'string' ? arg : parts.env[arg.env]))
  return { args, env: parts.env, message: parts.message, session }
}

// Claude Code's flags that pick the conversation: with one of them, Nara leaves the session alone.
const SESSION_FLAGS = new Set([
  '--resume',
  '-r',
  '--continue',
  '-c',
  '--session-id',
  '--print',
  '-p',
  '--fork-session'
])

// The arguments and variables both of the above start from. An argument is a word, or { env } for
// the value of one of the variables. `quiet` leaves the role's first message out.
function agentParts({
  agent,
  session,
  resuming,
  role: key,
  nodeId,
  hooks,
  worktree,
  cwd,
  quiet
}: AgentOptions & { session?: string; resuming: boolean; quiet?: boolean }): {
  args: Arg[]
  env: Env
  message: string | null
} {
  const role = findRole(key)
  const { model, mode, access, kickoff } = roleProfile(role)
  const args: Arg[] = []
  const env: Env = { NARA_PROMPT: agentPrompt(nodeId, role, worktree) }
  let message: string | null = null

  if (agent === 'claude') {
    // The id ends up in a shell command line: anything but a UUID could smuggle in a command.
    if (session && UUID.test(session)) args.push(resuming ? '--resume' : '--session-id', session)
    // Passed again on every resume: Claude Code may reuse the one saved at the first launch, but
    // where it doesn't, the role would be lost.
    args.push('--append-system-prompt', { env: 'NARA_PROMPT' })
    if (model) args.push('--model', model)
    if (mode) args.push('--permission-mode', mode)
    if (access === 'read-only') args.push('--disallowedTools', EDIT_TOOLS.join(','))
    // The hooks tell Nara when the agent starts and ends a turn and when it asks for something
    // (main/status.js), which beats guessing from the terminal's output.
    // The status line hands Nara the plan's limits (main/usage.js); the user's own status line,
    // if they have one, still prints through it.
    if (hooks) {
      env.NARA_SETTINGS = JSON.stringify({
        hooks,
        statusLine: { type: 'command', command: 'nara statusline' }
      })
      args.push('--settings', { env: 'NARA_SETTINGS' })
      const own = userStatusLine(cwd)
      if (own) env.NARA_USER_STATUSLINE = own
    }
  } else if (agent === 'codex') {
    // Codex takes extra instructions as a config value, in TOML. A JSON string is a valid TOML
    // string, escapes and all.
    env.NARA_CODEX_CONFIG = `developer_instructions=${JSON.stringify(env.NARA_PROMPT)}`
    args.push('-c', { env: 'NARA_CODEX_CONFIG' })
    if (access === 'read-only') args.push('--sandbox', 'read-only')
  } else {
    // The rest have no flag for it that holds across versions: the prompt is their first message,
    // and the role's first task follows it there.
    message = contextMessage(env.NARA_PROMPT, quiet ? '' : kickoff)
    return { args, env, message }
  }

  // The role's first message starts the conversation, once: a node that resumes is past it. `--`
  // ends the options, so a flag that takes several values can't swallow it.
  if (kickoff && !resuming && !quiet) {
    env.NARA_KICKOFF = kickoff
    args.push('--', { env: 'NARA_KICKOFF' })
  }

  return { args, env, message }
}

// The first message of an agent that takes its context that way: Nara's prompt, said to be
// standing instructions, and then the role's first task or a short acknowledgement.
function contextMessage(prompt: string, kickoff: string): string {
  const ask = kickoff
    ? `Then start with this:\n\n${kickoff}`
    : 'Reply with one short line saying you are ready, and wait for the next message.'
  return `[nara] Standing instructions for this whole session, from the app you run in:\n\n${prompt}\n\n${ask}`
}

// A plain terminal can run a command as it opens (a dev server, a watcher) and stay a shell after
// it: `exec` swaps in an interactive shell once the command ends or is stopped with Ctrl+C. Like
// an agent's prompt, the command goes through the environment, so its text is never quoted into
// the command line; it runs again whenever the node reopens.
export function startupLaunch(command: string, shell: string): Launch {
  return {
    // bash only loads the shell integration (shell.js) with its --rcfile, on the exec too.
    command: 'eval "$NARA_STARTUP"; exec "$NARA_SHELL" ${NARA_BASHRC:+--rcfile "$NARA_BASHRC"}',
    env: { NARA_STARTUP: command, NARA_SHELL: shell }
  }
}

// The status line command the user set for Claude Code, if any: the project's settings win over
// the user's, as in Claude Code.
function userStatusLine(cwd?: string): string | null {
  const files = [join(claudeHome(), 'settings.json')]
  if (cwd) {
    files.push(join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json'))
  }
  let command = null
  for (const file of files) {
    try {
      const line = JSON.parse(readFileSync(file, 'utf8')).statusLine
      if (line?.type === 'command' && typeof line.command === 'string') command = line.command
    } catch {
      // No such file, or not JSON.
    }
  }
  return command
}

// Claude Code saves a conversation as <config>/projects/<folder>/<session>.jsonl, and only once
// the first message is sent. Before that there's nothing to resume and `--resume` would fail
// with "No conversation found", so the agent starts again under the same id. Looking in every
// folder avoids depending on how Claude Code names them; if the layout ever changes, agents
// start new conversations instead of breaking.
export function hasConversation(session: string): boolean {
  return Boolean(transcriptPath(session))
}

// Where the conversation is saved, or null if it isn't yet.
export function transcriptPath(session: string | undefined): string | null {
  if (!session) return null
  const projects = join(claudeHome(), 'projects')
  try {
    for (const folder of readdirSync(projects)) {
      const file = join(projects, folder, `${session}.jsonl`)
      if (existsSync(file)) return file
    }
  } catch {
    // No projects folder yet.
  }
  return null
}

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}
