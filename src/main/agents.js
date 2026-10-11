import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { AGENTS } from '../shared/agents'
import { findRole } from './roles'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// How to open an agent in a node: the shell command, plus the variables it needs in its
// environment. Claude Code runs under a session id that Nara picked and saved with the node, so
// after a restart the node picks its conversation back up instead of starting over. `command` is
// the one the user typed in the new terminal dialog in place of the agent's own (`claude --model
// opus`, a path): it's their command line, run as if they had typed it, with Nara's flags after it.
export function agentLaunch({ agent, command: typed, session, role, nodeId }) {
  const { prompt } = AGENTS[agent]
  const command = typeof typed === 'string' && typed.trim() ? typed.trim() : AGENTS[agent].command
  const args = []
  const env = {}

  // The id ends up in a shell command line: anything but a UUID could smuggle in a command.
  if (agent === 'claude' && UUID.test(session ?? '')) {
    args.push(hasConversation(session) ? '--resume' : '--session-id', session)
  }

  // The prompt goes through the environment and the shell expands it as a single argument, so its
  // text never has to be quoted into the command line. It's passed again on every resume: Claude
  // Code may reuse the one saved at the first launch, but where it doesn't, the role would be lost.
  if (prompt) {
    env.NARA_PROMPT = agentPrompt(nodeId, findRole(role))
    args.push('--append-system-prompt', '"$NARA_PROMPT"')
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

// What every agent is told about Nara, followed by its role's instructions, if it has one.
function agentPrompt(nodeId, role) {
  const base = `You are running inside Nara, a desktop app where terminals and AI agents live as nodes on an infinite canvas. You are terminal ${nodeId}. The user sees your terminal on the canvas and can link it to other nodes: other terminals, usually running agents, and notes, which are shared text.

You reach the nodes linked to you with the \`nara\` command, run from your shell:
  nara peers                        list the terminals and notes linked to you, with their roles
  nara send <terminal> <text>       send a message to a linked terminal
  nara note read <note>             print a linked note
  nara note write <note> <text>     replace the note's text
  nara note append <note> <text>    add a line to the end of the note

How it works:
- The user can add and remove links at any time. Run \`nara peers\` whenever you need to know who you can reach, instead of relying on an earlier answer.
- A message arrives in the other terminal as if someone had typed it there. Messages to you arrive the same way, as a new turn that starts with "[nara · message from terminal N · reply with: nara send N ...]". That turn comes from the agent in terminal N, not from the user. Turns without that header come from the user, who has the final word.
- Don't sleep, poll or wait for a reply: end your turn, and the reply will arrive as a new message.
- Only terminals running an agent can receive messages; \`nara peers\` marks the ones that only have a shell.
- The user reads the notes too. Use them for what's worth keeping in view, like a plan, a status or a result. Keep messages short and point to a note or a file for anything long.
- Text with several lines or with quotes is safer through stdin: nara send 2 <<'EOF' ... EOF`
  return role ? `${base}\n\n${role.instructions}` : base
}

// Claude Code saves a conversation as <config>/projects/<folder>/<session>.jsonl, and only once
// the first message is sent. Before that there's nothing to resume and `--resume` would fail
// with "No conversation found", so the agent starts again under the same id. Looking in every
// folder avoids depending on how Claude Code names them; if the layout ever changes, agents
// start new conversations instead of breaking.
function hasConversation(session) {
  const projects = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
  try {
    return readdirSync(projects).some((folder) =>
      existsSync(join(projects, folder, `${session}.jsonl`))
    )
  } catch {
    return false
  }
}
