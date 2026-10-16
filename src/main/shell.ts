import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { AGENTS } from '../shared/agents'

// The shell integration of plain terminals: an agent CLI typed in one (claude, codex, gemini…)
// starts through `nara run` (cli.ts), which hands it Nara's prompt and the node's role. Each CLI
// gets a shell function, defined after the user's startup files so it wins over the PATH;
// `command claude` still runs the CLI as it is. The integration also marks where each command
// starts and ends (changes.ts).
//
// zsh gets a ZDOTDIR of Nara's whose files read the user's and then add the functions; bash gets
// an --rcfile that reads ~/.bashrc first. Other shells get no integration.

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
# Where each command starts and ends, with the folder it runs in, so Nara can tell which files
# this terminal changed. The marks are escape sequences the terminal doesn't show.
if [ -n "$ZSH_VERSION" ]; then
  __nara_preexec() { printf '\\033]133;C;nara-cwd=%s\\007' "$PWD"; }
  __nara_precmd() { printf '\\033]133;D;nara-cwd=%s\\007' "$PWD"; }
  preexec_functions+=(__nara_preexec)
  precmd_functions+=(__nara_precmd)
elif [ -n "$BASH_VERSION" ]; then
  PS0='\\e]133;C;nara-cwd=$PWD\\a'"\${PS0:-}"
  PROMPT_COMMAND="printf '\\\\033]133;D;nara-cwd=%s\\\\007' \\"\\$PWD\\"\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
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
