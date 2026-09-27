import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { AGENTS } from '../shared/agents'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The shell command that opens an agent in a node. Claude Code runs under a session id that anbu
// picked and saved with the node, so after a restart the node picks its conversation back up
// instead of starting over.
export function agentCommand(agent, session) {
  const { command } = AGENTS[agent]
  // The id ends up in a shell command line: anything but a UUID could smuggle in a command.
  if (agent !== 'claude' || !UUID.test(session ?? '')) return command
  return `${command} ${hasConversation(session) ? '--resume' : '--session-id'} ${session}`
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
