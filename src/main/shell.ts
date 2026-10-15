import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { AGENTS } from '../shared/agents'

// The shell integration of the canvas's plain terminals: the agent CLIs typed in one (claude,
// codex, gemini…) start through `nara run` (cli.js), which hands them Nara's prompt and the node's
// role and tells the app an agent is running there, as if it had opened from the new terminal
// dialog. It's a shell function per CLI, defined after the user's own startup files, so it wins
// over anything on the PATH; `command claude` still runs the CLI as it is.
//
// zsh reads its startup files from ZDOTDIR: Nara points it at its own, which read the user's
// (from wherever they were) and then add the functions. bash takes an --rcfile that reads
// ~/.bashrc first. Other shells get no integration, and the CLIs run as they are.

// The files live in the data folder, written again at every start so they follow the app.
function folder(): string {
  return join(app.getPath('userData'), 'shell')
}

export function writeShellIntegration(): void {
  const root = folder()
  mkdirSync(join(root, 'zsh'), { recursive: true })
  const functions = Object.values(AGENTS)
    .map(({ command }) => `${command}() { "$NARA_BIN" run ${command} "$@"; }`)
    .join('\n')
  writeFileSync(
    join(root, 'init.sh'),
    `# Nara: the agent CLIs typed in this terminal start through Nara, which hands them the canvas,
# the links and the node's role. \`command <cli>\` runs one as it is.
${functions}
`
  )
  // .zshenv runs first: it reads the user's own, which may move ZDOTDIR, notes where it ends up,
  // and points zsh back here for .zshrc.
  writeFileSync(
    join(root, 'zsh', '.zshenv'),
    `NARA_ZDOTDIR=$ZDOTDIR
ZDOTDIR=\${NARA_USER_ZDOTDIR:-$HOME}
[ -f "$ZDOTDIR/.zshenv" ] && . "$ZDOTDIR/.zshenv"
NARA_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$NARA_ZDOTDIR
`
  )
  writeFileSync(
    join(root, 'zsh', '.zshrc'),
    `ZDOTDIR=$NARA_USER_ZDOTDIR
unset NARA_ZDOTDIR
[ -f "$ZDOTDIR/.zshrc" ] && . "$ZDOTDIR/.zshrc"
[ -f "$NARA_SHELL_INIT" ] && . "$NARA_SHELL_INIT"
`
  )
  writeFileSync(
    join(root, 'bashrc'),
    `[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
[ -f "$NARA_SHELL_INIT" ] && . "$NARA_SHELL_INIT"
`
  )
}

// What a plain terminal's shell needs to load the integration: { args, env }. `args` are for the
// shell's own command line, before any -c.
export function shellIntegration(shell: string): {
  args: string[]
  env: Record<string, string | undefined>
} {
  const root = folder()
  const env = { NARA_SHELL_INIT: join(root, 'init.sh') }
  const name = basename(shell)
  if (name === 'zsh') {
    return {
      args: [],
      env: {
        ...env,
        ZDOTDIR: join(root, 'zsh'),
        NARA_USER_ZDOTDIR: process.env.ZDOTDIR || process.env.HOME
      }
    }
  }
  if (name === 'bash') {
    const rc = join(root, 'bashrc')
    return { args: ['--rcfile', rc], env: { ...env, NARA_BASHRC: rc } }
  }
  return { args: [], env: {} }
}
