import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { AGENTS } from '../shared/agents'
import { EDIT_TOOLS, agentPrompt, roleProfile, type RoleProfile } from '../shared/prompt'
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

// An argument is a word, or { env } for the value of one of the variables, after `prefix` if it
// has one (`--policy=` and the path).
type Arg = string | { env: string; prefix?: string }
type Env = Record<string, string>

export interface Launch {
  command: string
  env: Env
  message?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The shell command and environment that open an agent in a node. Claude Code runs under a
// session id saved with the node, so it resumes its conversation after a restart. `command` is
// what the user typed in the new terminal dialog in place of the agent's own; Nara's flags go
// after it.
//
// Free text (the prompt, the first message, the hooks) travels in environment variables, so it
// never has to be quoted into the command line. An agent that takes its context as a message gets
// it back as `message`, pasted once the agent is up (pty.ts).
//
// With `powershell` (Windows), the command is PowerShell's instead of a POSIX shell's.
export function agentLaunch({
  agent,
  command: typed,
  session,
  powershell,
  ...options
}: AgentOptions & { command?: string; session?: string; powershell?: boolean }): Launch {
  const command = typeof typed === 'string' && typed.trim() ? typed.trim() : AGENTS[agent].command
  const resuming = agent === 'claude' && !!session && UUID.test(session) && hasConversation(session)
  const parts = agentParts({ agent, session, resuming, ...options })
  if (powershell) {
    return {
      command: powershellCommand(command, parts.args),
      env: parts.env,
      message: parts.message
    }
  }
  const words = parts.args.map((arg) =>
    typeof arg === 'string' ? arg : `${arg.prefix ?? ''}"$${arg.env}"`
  )
  return { command: [command, ...words].join(' '), env: parts.env, message: parts.message }
}

// The same command for PowerShell. Words are quoted, so PowerShell doesn't read a comma as a list
// or swallow `--`. Windows PowerShell passes an argument with quotes in it to a program as it is,
// and the program splits it there: the quotes are escaped by hand, the legacy way, which
// PowerShell 7 is told to keep. A CLI that isn't installed exits with 127, as in a POSIX shell, so
// the node says so (Terminal.tsx).
function powershellCommand(command: string, args: Arg[]): string {
  const quote = (word: string): string => `'${word.replace(/'/g, "''")}'`
  const escaped = (name: string): string =>
    `($env:${name} -replace '(\\\\*)"', '$1$1\\"' -replace '(\\\\+)$', '$1$1')`
  const words = args.map((arg) =>
    typeof arg === 'string'
      ? quote(arg)
      : arg.prefix
        ? `(${quote(arg.prefix)} + ${escaped(arg.env)})`
        : escaped(arg.env)
  )
  const program = quote(command.split(/\s+/)[0])
  return [
    `$PSNativeCommandArgumentPassing = 'Legacy'`,
    `if (-not (Get-Command ${program} -ErrorAction SilentlyContinue)) { exit 127 }`,
    `${command} ${words.join(' ')}`,
    'exit $LASTEXITCODE'
  ].join('; ')
}

// The same for an agent typed in a plain terminal (`nara run`, shell.ts). Nara's arguments go
// before the user's, so the user's win. Claude Code gets its own session id unless the user chose
// one, so its spend shows up like an agent node's. The role's first message only goes in when the
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
  const args = parts.args.map((arg) =>
    typeof arg === 'string' ? arg : `${arg.prefix ?? ''}${parts.env[arg.env]}`
  )
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
  const message: string | null = null

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
    // (main/status.ts), which beats guessing from the terminal's output.
    // The status line hands Nara the plan's limits (main/usage.ts); the user's own status line,
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
    return otherParts(agent, env, { mode, access, kickoff: quiet ? '' : kickoff }, Boolean(quiet))
  }

  // The role's first message starts the conversation, once: a node that resumes is past it. `--`
  // ends the options, so a flag that takes several values can't swallow it.
  if (kickoff && !resuming && !quiet) {
    env.NARA_KICKOFF = kickoff
    args.push('--', { env: 'NARA_KICKOFF' })
  }

  return { args, env, message }
}

// The other agents, each the way its CLI takes them (shared/agents.ts lists what each gets). The
// flags come from each CLI's --help; anything a CLI can't do is left out rather than guessed.
//
// An agent that takes its context as its opening message only gets it that way when the user typed
// nothing after the command (`quiet` is false); otherwise it's pasted once the agent is up. Flags
// that take a list are written with `=`, so they can't swallow the user's arguments.
function otherParts(
  agent: string,
  env: Env,
  { mode, access, kickoff }: Pick<RoleProfile, 'mode' | 'access' | 'kickoff'>,
  quiet: boolean
): { args: Arg[]; env: Env; message: string | null } {
  const prompt = env.NARA_PROMPT
  const readOnly = access === 'read-only'
  const args: Arg[] = []
  const opening = (flag: string | null): { args: Arg[]; env: Env; message: string | null } => {
    if (quiet) return { args, env, message: contextMessage(prompt, '') }
    env.NARA_OPENING = contextMessage(prompt, kickoff)
    args.push(...(flag ? [flag] : []), { env: 'NARA_OPENING' })
    return { args, env, message: null }
  }

  if (agent === 'qwen') {
    args.push('--append-system-prompt', { env: 'NARA_PROMPT' })
    const approval = ({ plan: 'plan', acceptEdits: 'auto-edit', auto: 'auto' } as Approvals)[mode]
    if (approval) args.push('--approval-mode', approval)
    if (readOnly && mode !== 'plan') {
      args.push(...QWEN_EDIT_TOOLS.map((tool) => `--exclude-tools=${tool}`))
    }
    if (kickoff) {
      env.NARA_KICKOFF = kickoff
      args.push('-i', { env: 'NARA_KICKOFF' })
    }
    return { args, env, message: null }
  }

  if (agent === 'copilot') {
    // Copilot reads the AGENTS.md of every folder in this list as custom instructions.
    const own = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS
    const dir = dirname(contextFile('AGENTS.md', prompt))
    env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = own ? `${dir},${own}` : dir
    if (mode === 'plan') args.push('--plan')
    else if (mode) args.push('--allow-tool=write')
    if (readOnly) args.push('--deny-tool=write')
    if (kickoff) {
      env.NARA_KICKOFF = kickoff
      args.push('-i', { env: 'NARA_KICKOFF' })
    }
    return { args, env, message: null }
  }

  if (agent === 'opencode') {
    // OpenCode adds the files listed in `instructions` to its own, and its permissions come as a
    // variable too. Plan mode is its built-in plan agent, which doesn't edit.
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ instructions: [contextFile('NARA.md', prompt)] })
    if (mode === 'plan') args.push('--agent', 'plan')
    if (readOnly) env.OPENCODE_PERMISSION = JSON.stringify({ edit: 'deny' })
    else if (mode && mode !== 'plan') env.OPENCODE_PERMISSION = JSON.stringify({ edit: 'allow' })
    return { args, env, message: kickoff || null }
  }

  if (agent === 'aider') {
    // A read-only file stays in Aider's chat for the whole session. Its ask mode answers and
    // plans without editing.
    env.NARA_CONTEXT_FILE = contextFile('nara-instructions.md', prompt)
    args.push('--read', { env: 'NARA_CONTEXT_FILE' })
    if (readOnly || mode === 'plan') args.push('--chat-mode', 'ask')
    if (mode === 'auto') args.push('--yes-always')
    return { args, env, message: kickoff || null }
  }

  if (agent === 'antigravity') {
    // Antigravity CLI takes no instructions on its command line: the context is its opening
    // message. Its modes only cover edits, and nothing denies its edit tools, so read-only access
    // is left to the prompt.
    const approval = (
      { plan: 'plan', acceptEdits: 'accept-edits', auto: 'accept-edits' } as Approvals
    )[mode]
    if (approval) args.push('--mode', approval)
    return opening('-i')
  }

  if (agent === 'cursor') {
    // Cursor Agent takes no instructions: the context is its opening prompt. Its ask mode reads
    // without editing.
    if (mode === 'plan') args.push('--mode', 'plan')
    else if (readOnly) args.push('--mode', 'ask')
    return opening(null)
  }

  // Amp, and any CLI started with `nara run`: pasted once it's up.
  return { args, env, message: contextMessage(prompt, kickoff) }
}

// A role's permission mode (shared/prompt.ts) as an agent's own approval mode.
type Approvals = Record<string, string | undefined>

// Qwen Code's tools that change files.
const QWEN_EDIT_TOOLS = ['edit', 'write_file', 'notebook_edit']

// Instructions an agent reads from a file, kept in the data folder in a folder named after their
// text: the same text is written once, and a file never changes under an agent reading it.
function contextFile(name: string, text: string): string {
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 16)
  const file = join(app.getPath('userData'), 'context', hash, name)
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return file
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
//
// PowerShell can't exec: it runs the command and stays open after it (pty.ts adds -NoExit).
export function startupLaunch(command: string, shell: string, powershell = false): Launch {
  if (powershell) {
    return { command: 'Invoke-Expression $env:NARA_STARTUP', env: { NARA_STARTUP: command } }
  }
  return {
    // bash only loads the shell integration (shell.ts) with its --rcfile, on the exec too.
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

// Claude Code saves a conversation as <config>/projects/<folder>/<session>.jsonl, and only after
// the first message. Until then `--resume` fails with "No conversation found", so the agent starts
// again under the same id. Every folder is searched rather than relying on how they're named.
function hasConversation(session: string): boolean {
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
