import { app } from 'electron'
import { createHash } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

// Nara's hooks in every agent CLI that has them: each tells Nara, through `nara hook <event> <cli>`
// (cli.ts), when the agent takes a prompt, ends its turn and asks the user for something
// (main/status.ts), and which conversation it's in so the node can resume it (main/messages.ts).
// The prompt hook hands the agent the canvas, and for a role that delegates an edit hook checks
// its editing tools against the canvas. The events are the same everywhere:
//   prompt   a turn starts (answered with the canvas)
//   stop     the turn is over
//   notify   the agent asks the user for something
//   edit     the agent is about to change a file (answered with a refusal, if it must not)
//
// Most CLIs take the hooks for one run, on the command line or in a variable. Cursor Agent,
// Antigravity CLI and Amp only read them from their own config folder, so Nara adds an entry of
// its own there, marked with its name; outside Nara it does nothing (nara-hook below). Aider has
// no hooks: it only runs a command when its answer is ready.
//
// Claude Code's are in its settings (main/agents.ts), with its status line.

export type Arg = string | { env: string; prefix?: string }
export type Env = Record<string, string>

// The tools that change files, by the names each CLI gives them: Claude Code, Codex, Qwen Code,
// Copilot CLI, OpenCode, Cursor Agent, Antigravity CLI and Amp.
export const EDIT_TOOL =
  /^(Edit|Write|MultiEdit|NotebookEdit|Delete|apply_patch|edit|write|write_file|notebook_edit|create|patch|multiedit|write_to_file|replace_file_content|multi_replace_file_content|edit_file|create_file)$/

// Adds an agent's hooks to the arguments and variables it starts with. `delegate` is whether its
// role delegates, which adds the edit hook.
export function addHooks(agent: string, args: Arg[], env: Env, delegate: boolean): void {
  if (delegate) env.NARA_DELEGATE = '1'
  if (agent === 'codex') codexHooks(args, env, delegate)
  else if (agent === 'copilot') {
    env.NARA_COPILOT_PLUGIN = copilotPlugin(delegate)
    args.push('--plugin-dir', { env: 'NARA_COPILOT_PLUGIN' })
  } else if (agent === 'qwen') env.QWEN_CODE_SYSTEM_DEFAULTS_PATH = qwenDefaults(delegate)
  else if (agent === 'opencode') opencodePlugin(env)
  else if (agent === 'aider') {
    env.NARA_AIDER_NOTIFY = 'nara hook stop aider'
    args.push('--notifications', '--notifications-command', { env: 'NARA_AIDER_NOTIFY' })
  } else if (agent === 'cursor') installOnce(agent, cursorHooks)
  else if (agent === 'antigravity') installOnce(agent, antigravityHooks)
  else if (agent === 'amp') installOnce(agent, ampPlugin)
}

// Claude Code's hooks, as its --settings takes them. Qwen Code takes the same.
export function claudeHooks(agent: string, delegate: boolean, edits: string): object {
  const hook = (event: string): object[] => [
    { hooks: [{ type: 'command', command: `nara hook ${event} ${agent}` }] }
  ]
  return {
    UserPromptSubmit: hook('prompt'),
    Stop: hook('stop'),
    Notification: hook('notify'),
    ...(delegate && { PreToolUse: [{ matcher: edits, ...hook('edit')[0] }] })
  }
}

// Codex takes each event's hooks as a config value in TOML, which a JSON string is. They only run
// once trusted, which Nara's are: the flag skips that check for this run.
function codexHooks(args: Arg[], env: Env, delegate: boolean): void {
  const events: [string, string, string?][] = [
    ['UserPromptSubmit', 'prompt'],
    ['Stop', 'stop'],
    ['PermissionRequest', 'notify'],
    ...(delegate ? [['PreToolUse', 'edit', '^apply_patch$'] as [string, string, string]] : [])
  ]
  for (const [event, name, matcher] of events) {
    const command = `{type="command",command=${JSON.stringify(`nara hook ${name} codex`)}}`
    const entry = `{${matcher ? `matcher=${JSON.stringify(matcher)},` : ''}hooks=[${command}]}`
    const key = `NARA_CODEX_HOOK_${name.toUpperCase()}`
    env[key] = `hooks.${event}=[${entry}]`
    args.push('-c', { env: key })
  }
  args.push('--dangerously-bypass-hook-trust')
}

// Copilot CLI loads a plugin from a folder for one run; its hooks file is in it. The prompt hook
// is the one that can change what the model reads.
function copilotPlugin(delegate: boolean): string {
  const hook = (event: string, matcher?: string): object[] => [
    { type: 'command', command: `nara hook ${event} copilot`, ...(matcher && { matcher }) }
  ]
  const hooks = {
    version: 1,
    hooks: {
      userPromptTransformed: hook('prompt'),
      agentStop: hook('stop'),
      notification: hook('notify'),
      ...(delegate && { preToolUse: hook('edit', 'edit|create') })
    }
  }
  const dir = hooksFolder(`copilot${delegate ? '-delegate' : ''}`)
  writeIfChanged(join(dir, 'plugin.json'), JSON.stringify({ name: 'nara', hooks: 'hooks.json' }))
  writeIfChanged(join(dir, 'hooks.json'), JSON.stringify(hooks, null, 2))
  return dir
}

// Qwen Code reads its system defaults from the file this variable names, under every other
// settings file, and adds their hooks to the user's. The defaults the user may already have go in
// too.
function qwenDefaults(delegate: boolean): string {
  const own = readJson(process.env.QWEN_CODE_SYSTEM_DEFAULTS_PATH || qwenSystemDefaults()) ?? {}
  const hooks: Record<string, unknown[]> = { ...(own.hooks as Record<string, unknown[]>) }
  const ours = claudeHooks('qwen', delegate, '^(edit|write_file|notebook_edit)$')
  for (const [event, entries] of Object.entries(ours)) {
    hooks[event] = [...(Array.isArray(hooks[event]) ? hooks[event] : []), ...entries]
  }
  const text = JSON.stringify({ ...own, hooks }, null, 2)
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 16)
  const file = join(hooksFolder('qwen'), `${hash}.json`)
  writeIfChanged(file, text)
  return file
}

function qwenSystemDefaults(): string {
  const settings = process.env.QWEN_CODE_SYSTEM_SETTINGS_PATH
  if (settings) return join(dirname(settings), 'system-defaults.json')
  if (process.platform === 'darwin')
    return '/Library/Application Support/QwenCode/system-defaults.json'
  if (process.platform === 'win32') return 'C:\\ProgramData\\qwen-code\\system-defaults.json'
  return '/etc/qwen-code/system-defaults.json'
}

// OpenCode loads plugins listed in its config, which Nara already passes in a variable
// (main/agents.ts), from a file path as well as a package.
function opencodePlugin(env: Env): void {
  const file = join(hooksFolder('opencode'), 'nara.js')
  writeIfChanged(file, pluginSource('opencode'))
  const config = env.OPENCODE_CONFIG_CONTENT ? JSON.parse(env.OPENCODE_CONFIG_CONTENT) : {}
  config.plugin = [...(config.plugin ?? []), `file://${file.replace(/\\/g, '/')}`]
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
}

// The plugins of OpenCode and Amp, which run in the CLI's own process: they call `nara hook` the
// way the other CLIs' hooks do, and act on its answer. Outside Nara they do nothing.
function pluginSource(cli: 'opencode' | 'amp'): string {
  const common = `import { spawnSync } from 'node:child_process'

// Nara's plugin (written by Nara, main/hooks.ts): in a Nara terminal it hands each prompt the
// canvas, tells Nara when a turn starts and ends, and checks the edits of a role that delegates.
// Outside Nara it does nothing.
const EDITS = ${EDIT_TOOL.toString()}

function hook(event, data) {
  const bin = process.env.NARA_BIN
  if (!bin) return {}
  const windows = process.platform === 'win32'
  const run = spawnSync(windows ? \`"\${bin}"\` : bin, ['hook', event, '${cli}'], {
    input: JSON.stringify(data),
    encoding: 'utf8',
    timeout: 5000,
    shell: windows
  })
  try {
    return JSON.parse(run.stdout || '{}')
  } catch {
    return {}
  }
}
`
  if (cli === 'opencode') {
    return `${common}
export const Nara = async () => ({
  'chat.message': async (input, output) => {
    const { context } = hook('prompt', { session: input.sessionID })
    const part = output.parts.find((part) => part.type === 'text' && !part.synthetic)
    if (context && part) part.text = \`\${part.text}\\n\\n\${context}\`
  },
  'tool.execute.before': async (input) => {
    if (!process.env.NARA_DELEGATE || !EDITS.test(input.tool)) return
    const { deny } = hook('edit', { session: input.sessionID, tool: input.tool })
    if (deny) throw new Error(deny)
  },
  event: async ({ event }) => {
    const session = event.properties?.sessionID
    if (event.type === 'session.idle') hook('stop', { session })
    else if (event.type === 'permission.asked' || event.type === 'permission.updated') {
      hook('notify', { session, type: 'permission_prompt' })
    }
  }
})
`
  }
  return `${common}
export const description = 'Nara: hands Amp the canvas and follows its turns in Nara terminals'

export default function (amp) {
  if (!process.env.NARA_BIN) return
  amp.on('agent.start', async (event) => {
    const { context } = hook('prompt', { session: event.thread.id })
    return context ? { message: { content: context } } : {}
  })
  amp.on('agent.end', async (event) => {
    hook('stop', { session: event.thread.id })
  })
  amp.on('tool.call', async (event) => {
    if (!process.env.NARA_DELEGATE || !EDITS.test(event.tool)) return { action: 'allow' }
    const { deny } = hook('edit', { session: event.thread.id, tool: event.tool })
    return deny ? { action: 'reject-and-continue', message: deny } : { action: 'allow' }
  })
}
`
}

// Cursor Agent's hooks, in its own hooks.json: it adds the canvas to the prompt, and its write tool
// covers edits. The entries Nara wrote before are replaced, the user's kept.
function cursorHooks(): void {
  const dir =
    process.env.CURSOR_CONFIG_DIR?.trim() ||
    (process.env.XDG_CONFIG_HOME?.trim()
      ? join(process.env.XDG_CONFIG_HOME, 'cursor')
      : join(homedir(), '.cursor'))
  const file = join(dir, 'hooks.json')
  const config = readJson(file)
  if (!config) return
  const hooks = (config.hooks ?? {}) as Record<string, { command?: string }[]>
  const ours: Record<string, { type: string; command: string; matcher?: string }> = {
    beforeSubmitPrompt: { type: 'command', command: guarded('prompt cursor') },
    stop: { type: 'command', command: guarded('stop cursor') },
    preToolUse: { type: 'command', command: guarded('edit cursor'), matcher: 'Write|Delete' }
  }
  for (const [event, entry] of Object.entries(ours)) {
    const others = (hooks[event] ?? []).filter((hook) => !hook.command?.includes(MARK))
    hooks[event] = [...others, entry]
  }
  writeIfChanged(file, JSON.stringify({ version: 1, ...config, hooks }, null, 2))
}

// Antigravity CLI's hooks file holds named groups of hooks: Nara's is "nara".
function antigravityHooks(): void {
  const file = join(homedir(), '.gemini', 'config', 'hooks.json')
  const config = readJson(file)
  if (!config) return
  const hook = (event: string, matcher?: string): object[] => [
    { ...(matcher && { matcher }), hooks: [{ type: 'command', command: guarded(event) }] }
  ]
  config.nara = {
    PreInvocation: hook('prompt antigravity'),
    Stop: hook('stop antigravity'),
    PreToolUse: hook(
      'edit antigravity',
      'write_to_file|replace_file_content|multi_replace_file_content'
    )
  }
  writeIfChanged(file, JSON.stringify(config, null, 2))
}

// Amp's system plugins folder.
function ampPlugin(): void {
  const config = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  writeIfChanged(join(config, 'amp', 'plugins', `${MARK}.ts`), pluginSource('amp'))
}

// What marks Nara's entries in a CLI's own config, so they can be found and replaced.
const MARK = 'nara-hook'

// A hook command for a CLI's own config, which runs outside Nara too: a script in Nara's data
// folder that only calls `nara hook` inside a Nara terminal.
function guarded(args: string): string {
  const windows = process.platform === 'win32'
  const script = join(hooksFolder(''), windows ? `${MARK}.cmd` : MARK)
  writeIfChanged(
    script,
    windows
      ? '@echo off\r\nif not defined NARA_BIN exit /b 0\r\n"%NARA_BIN%" hook %*\r\n'
      : '#!/bin/sh\n# Nara\'s hooks for agent CLIs: they do nothing outside a Nara terminal.\n[ -n "$NARA_BIN" ] || exit 0\nexec "$NARA_BIN" hook "$@"\n'
  )
  if (!windows) chmodSync(script, 0o755)
  return `"${script}" ${args}`
}

// The global entries are written once per run of the app, the first time an agent needs them.
const installed = new Set<string>()
function installOnce(agent: string, install: () => void): void {
  if (installed.has(agent)) return
  installed.add(agent)
  try {
    install()
  } catch (error) {
    console.error(`Nara couldn't add its hooks for ${agent}:`, error)
  }
}

function hooksFolder(name: string): string {
  const dir = join(app.getPath('userData'), 'hooks', name)
  mkdirSync(dir, { recursive: true })
  return dir
}

// A JSON object from a file: empty if there's no file, null if it isn't one (it's left alone).
function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return {}
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function writeIfChanged(file: string, text: string): void {
  try {
    if (readFileSync(file, 'utf8') === text) return
  } catch {
    // Not there yet.
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
