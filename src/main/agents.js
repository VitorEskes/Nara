import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { AGENTS } from '../shared/agents'
import { EDIT_TOOLS, agentPrompt, roleProfile } from '../shared/prompt'
import { findRole } from './roles'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// How to open an agent in a node: the shell command, plus the variables it needs in its
// environment. Claude Code runs under a session id that Nara picked and saved with the node, so
// after a restart the node picks its conversation back up instead of starting over. `command` is
// the one the user typed in the new terminal dialog in place of the agent's own (`claude --model
// opus`, a path): it's their command line, run as if they had typed it, with Nara's flags after it.
//
// Free text (the prompt, the first message, the hooks) goes through the environment and the shell
// expands each as a single argument, so it never has to be quoted into the command line. The
// rest comes from fixed lists (shared/prompt.js) and goes in as it is.
export function agentLaunch({
  agent,
  command: typed,
  session,
  role: key,
  nodeId,
  hooks,
  worktree
}) {
  const command = typeof typed === 'string' && typed.trim() ? typed.trim() : AGENTS[agent].command
  const role = findRole(key)
  const { model, mode, access, kickoff } = roleProfile(role)
  const args = []
  const env = { NARA_PROMPT: agentPrompt(nodeId, role, worktree) }
  let resuming = false

  if (agent === 'claude') {
    // The id ends up in a shell command line: anything but a UUID could smuggle in a command.
    if (UUID.test(session ?? '')) {
      resuming = hasConversation(session)
      args.push(resuming ? '--resume' : '--session-id', session)
    }
    // Passed again on every resume: Claude Code may reuse the one saved at the first launch, but
    // where it doesn't, the role would be lost.
    args.push('--append-system-prompt', '"$NARA_PROMPT"')
    if (model) args.push('--model', model)
    if (mode) args.push('--permission-mode', mode)
    if (access === 'read-only') args.push('--disallowedTools', EDIT_TOOLS.join(','))
    // The hooks tell Nara when the agent starts and ends a turn and when it asks for something
    // (main/status.js), which beats guessing from the terminal's output.
    if (hooks) {
      env.NARA_SETTINGS = JSON.stringify({ hooks })
      args.push('--settings', '"$NARA_SETTINGS"')
    }
  } else if (agent === 'codex') {
    // Codex takes extra instructions as a config value, in TOML. A JSON string is a valid TOML
    // string, escapes and all.
    env.NARA_CODEX_CONFIG = `developer_instructions=${JSON.stringify(env.NARA_PROMPT)}`
    args.push('-c', '"$NARA_CODEX_CONFIG"')
    if (access === 'read-only') args.push('--sandbox', 'read-only')
  }

  // The role's first message starts the conversation, once: a node that resumes is past it. `--`
  // ends the options, so a flag that takes several values can't swallow it.
  if (kickoff && !resuming) {
    env.NARA_KICKOFF = kickoff
    args.push('--', '"$NARA_KICKOFF"')
  }

  return { command: [command, ...args].join(' '), env }
}

// A plain terminal can run a command as it opens (a dev server, a watcher) and stay a shell after
// it: `exec` swaps in an interactive shell once the command ends or is stopped with Ctrl+C. Like
// an agent's prompt, the command goes through the environment, so its text is never quoted into
// the command line; it runs again whenever the node reopens.
export function startupLaunch(command, shell) {
  return {
    command: 'eval "$NARA_STARTUP"; exec "$NARA_SHELL"',
    env: { NARA_STARTUP: command, NARA_SHELL: shell }
  }
}

// Claude Code saves a conversation as <config>/projects/<folder>/<session>.jsonl, and only once
// the first message is sent. Before that there's nothing to resume and `--resume` would fail
// with "No conversation found", so the agent starts again under the same id. Looking in every
// folder avoids depending on how Claude Code names them; if the layout ever changes, agents
// start new conversations instead of breaking.
export function hasConversation(session) {
  return Boolean(transcriptPath(session))
}

// Where the conversation is saved, or null if it isn't yet.
export function transcriptPath(session) {
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

export function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}
