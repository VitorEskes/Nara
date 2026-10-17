import { connect } from 'net'
import { spawn, spawnSync } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { delimiter, join } from 'path'

// The app's answers (main/messages.ts).
interface Peer {
  nodeId: number
  type: 'terminal' | 'note' | 'browser'
  title?: string
  program?: string
  role?: string
  model?: string
  branch?: string
  state?: string | null
  canReceive?: boolean
  url?: string | null
}
interface Answer {
  peers?: Peer[]
  output?: object
  model?: string
  conflict?: string[]
  text?: string
  title?: string
  url?: string
  file?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}
// What Claude Code hands its status line.
interface StatusInput {
  model?: { display_name?: string }
  context_window?: { used_percentage?: number }
  rate_limits?: Record<string, { used_percentage?: number } | undefined>
}

// The `nara` command that runs inside canvas terminals. It does nothing on its own: it sends
// the request to the app over the socket in NARA_SOCK and prints the response. This file is run
// by resources/bin/nara, with Electron itself acting as Node.

const HELP = `usage:
  nara peers                        list the terminals and notes linked to this one, with roles
  nara canvas                       describe the whole canvas and what changed since the last turn
  nara send <terminal> <text>       send the text to a linked terminal
  nara note read <note>             print the text of a linked note
  nara note write <note> <text>     replace the note's text
  nara note append <note> <text>    add the text to the end of the note, on a new line
  nara browser open <browser> <url> load a page in a linked browser
  nara browser read <browser>       print the page's address, title and text
  nara browser shot <browser>       save a screenshot of the page and print its path
  nara browser reload <browser>     load the page again
  nara run <cli> [args]             start an agent CLI here with Nara's context and the role

For an agent whose role delegates (the Orchestrator):
  nara model <terminal> <model>     run a linked Claude Code agent on opus, sonnet, haiku or default
  nara merge <terminal>             merge a linked agent's worktree branch into its base

Without <text>, send, write and append read it from stdin.

A message arrives in the target terminal as if someone had typed it and pressed Enter.
The reply, if any, arrives in this terminal the same way: no need to wait or check for it.
A note is shared text on the canvas: anyone linked to it can read it, and so can the user.
A browser is a web page on the canvas that the user sees too: open your dev server in it.`

// `nara hook <event>` is run by Claude Code's hooks (pty.ts) and fails silently, since an error
// would show up in the agent. What the app answers for Claude Code (the canvas, or a refused edit)
// is printed for it to read. `nara run <cli> [args]` starts an agent CLI typed in a terminal
// (shell.ts) with the flags and variables the app gives it; outside Nara the CLI runs as it is.
if (process.argv[2] === 'run') {
  run(process.argv[3], process.argv.slice(4))
} else if (process.argv[2] === 'hook') {
  hook(process.argv[3]).finally(() => process.exit(0))
} else if (process.argv[2] === 'statusline') {
  statusline().finally(() => process.exit(0))
} else {
  main().catch((error) => {
    console.error(`nara: ${error.message}`)
    process.exit(1)
  })
}

async function run(name: string, args: string[]): Promise<void> {
  let launch: { command: string; args: string[]; env: Record<string, string> } = {
    command: name,
    args: [],
    env: {}
  }
  let started = false
  if (process.env.NARA_SOCK) {
    try {
      const answer = await request({ command: 'run', agent: name, args })
      launch = { command: answer.command ?? name, args: answer.args ?? [], env: answer.env ?? {} }
      started = true
    } catch (error) {
      console.error(`nara: ${(error as Error).message}; starting ${name} on its own`)
    }
  }
  const program = findProgram(launch.command)
  if (!program) {
    console.error(`${launch.command}: command not found`)
    process.exit(127)
  }
  // The CLI gets the keys: Ctrl+C is for it, and only it decides whether to quit.
  process.on('SIGINT', () => {})
  const env: NodeJS.ProcessEnv = { ...process.env, ...launch.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(program, [...launch.args, ...args], { stdio: 'inherit', env })
  for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => child.kill(signal))
  }
  const done = async (code: number): Promise<void> => {
    if (started) {
      await Promise.race([
        request({ command: 'run-exit' }).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1000))
      ])
    }
    process.exit(code)
  }
  child.on('error', (error) => {
    console.error(`${launch.command}: ${error.message}`)
    done(126)
  })
  child.on('exit', (code, signal) => done(code ?? (signal ? 128 : 1)))
}

// The program on the PATH, as the shell would find it.
function findProgram(name: string): string | null {
  if (!name) return null
  if (name.includes('/')) return name
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const file = join(dir, name)
    try {
      if (statSync(file).isFile()) {
        accessSync(file, constants.X_OK)
        return file
      }
    } catch {
      // Not here.
    }
  }
  return null
}

async function hook(event: string | undefined): Promise<void> {
  if (!process.env.NARA_SOCK || !event) return
  let payload = {}
  try {
    let text = ''
    for await (const chunk of process.stdin) text += chunk
    const data = JSON.parse(text || '{}')
    payload = { message: data.message, type: data.notification_type }
  } catch {
    // The event alone is enough.
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
  const answer = await Promise.race([
    request({ command: 'hook', event, payload }).catch(() => {}),
    timeout
  ])
  // Writes to a pipe can be asynchronous (macOS), and the process exits right after: wait for it.
  const output = answer?.output
  if (output) await new Promise((resolve) => process.stdout.write(JSON.stringify(output), resolve))
}

// `nara statusline` is Claude Code's status line in Nara's agents (main/agents.ts). It hands Nara
// the plan's limits Claude Code passes it, then prints the user's own status line if they have
// one (NARA_USER_STATUSLINE), or a short one of its own.
async function statusline(): Promise<void> {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  let data: StatusInput = {}
  try {
    data = JSON.parse(text || '{}')
  } catch {
    // Printed as it is below.
  }
  if (process.env.NARA_SOCK && data.rate_limits) {
    const timeout = new Promise((resolve) => setTimeout(resolve, 1000))
    await Promise.race([
      request({ command: 'statusline', payload: { rateLimits: data.rate_limits } }).catch(() => {}),
      timeout
    ])
  }
  const own = process.env.NARA_USER_STATUSLINE
  if (own) {
    const result = spawnSync('sh', ['-c', own], { input: text, encoding: 'utf8', timeout: 5000 })
    process.stdout.write(result.stdout ?? '')
    return
  }
  const parts = [data.model?.display_name]
  const context = data.context_window?.used_percentage
  if (context !== undefined && Number.isFinite(context))
    parts.push(`${Math.round(context)}% context`)
  const limits = data.rate_limits ?? {}
  const fiveHour = limits.five_hour?.used_percentage
  if (fiveHour !== undefined && Number.isFinite(fiveHour)) {
    parts.push(`${Math.round(fiveHour)}% 5h`)
  }
  const week = limits.seven_day?.used_percentage
  if (week !== undefined && Number.isFinite(week)) {
    parts.push(`${Math.round(week)}% week`)
  }
  process.stdout.write(`\x1b[2m${parts.filter(Boolean).join(' · ')}\x1b[0m`)
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (!process.env.NARA_SOCK) throw new Error('run this command inside a Nara terminal')

  if (command === 'peers') {
    const { peers = [] } = await request({ command })
    if (peers.length === 0) console.log('nothing linked to this terminal')
    for (const peer of peers) {
      const { nodeId, type, title, program, role, model, branch, state, canReceive, url } = peer
      // A node the user renamed shows its name after the id, which is still what commands take.
      const name = title && title !== `${type} ${nodeId}` ? `  "${title}"` : ''
      if (type === 'note') {
        console.log(`note ${nodeId}${name}`)
        continue
      }
      if (type === 'browser') {
        console.log(`browser ${nodeId}${name}  ${url || '(not loaded)'}`)
        continue
      }
      const busy = state === 'working' ? 'working' : state === 'waiting' && 'waiting on the user'
      const detail = [role && `(${role})`, model, branch, busy].filter(Boolean).join('  ')
      const warning = canReceive ? '' : "  (shell only, can't receive messages)"
      console.log(`terminal ${nodeId}${name}  ${program}${detail ? `  ${detail}` : ''}${warning}`)
    }
    return
  }

  if (command === 'canvas') {
    const { text } = await request({ command })
    console.log(text || 'nothing else on the canvas')
    return
  }

  if (command === 'model') {
    const [target, model] = args
    const to = nodeNumber(target, 'which terminal? e.g. nara model 2 sonnet')
    if (!model) throw new Error('which model? opus, sonnet, haiku or default')
    const answer = await request({ command, to, text: model })
    console.log(`terminal ${to} runs on ${answer.model}; messages sent now reach it once it's back`)
    return
  }

  if (command === 'merge') {
    const to = nodeNumber(args[0], 'which terminal? e.g. nara merge 2')
    const answer = await request({ command, to })
    console.log(answer.text)
    if (answer.conflict) {
      console.log(answer.conflict.map((file) => `  ${file}`).join('\n'))
      process.exit(1)
    }
    return
  }

  if (command === 'send') {
    const [target, ...words] = args
    const to = nodeNumber(target, 'which terminal? e.g. nara send 2 "hi"')
    const text = await readText(words, 'missing message, e.g. nara send 2 "hi"')
    await request({ command, to, text })
    console.log(`delivered to terminal ${to}`)
    return
  }

  if (command === 'note') {
    const [action, target, ...words] = args
    if (!action || !['read', 'write', 'append'].includes(action)) {
      throw new Error('usage: nara note <read|write|append> <note> [text]')
    }
    const to = nodeNumber(target, `which note? e.g. nara note ${action} 2`)

    if (action === 'read') {
      const { text } = await request({ command, action, to })
      // The text alone goes to stdout, so it can be piped or redirected as it is.
      if (!text) console.error(`note ${to} is empty`)
      else process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
      return
    }

    const text = await readText(words, `missing text, e.g. nara note ${action} 2 "hi"`)
    await request({ command, action, to, text })
    console.log(action === 'write' ? `wrote note ${to}` : `appended to note ${to}`)
    return
  }

  if (command === 'browser') {
    const [action, target, ...words] = args
    if (!action || !['open', 'read', 'shot', 'reload'].includes(action)) {
      throw new Error('usage: nara browser <open|read|shot|reload> <browser> [url]')
    }
    const to = nodeNumber(target, `which browser? e.g. nara browser ${action} 3`)
    const text = action === 'open' ? words.join(' ') : undefined
    const result = await request({ command, action, to, text })
    if (action === 'read') {
      console.log(`${result.title || '(untitled)'}\n${result.url}\n`)
      const text = result.text ?? ''
      process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
    } else if (action === 'shot') console.log(result.file)
    else console.log(`browser ${to}: ${result.url}${result.title ? `  "${result.title}"` : ''}`)
    return
  }

  throw new Error(`unknown command: ${command}\n\n${HELP}`)
}

// Accepts "2", "terminal 2" or "note2": the number is what the node title shows.
function nodeNumber(target: string | undefined, hint: string): number {
  const id = Number(target?.match(/\d+$/)?.[0])
  if (!id) throw new Error(hint)
  return id
}

// The text given as arguments or, with none, whatever comes in on stdin. An empty argument
// counts: `nara note write 2 ""` clears the note.
async function readText(words: string[], hint: string): Promise<string> {
  if (words.length > 0) return words.join(' ')
  if (process.stdin.isTTY) throw new Error(hint)
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}

function request(body: object): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const socket = connect(process.env.NARA_SOCK ?? '')
    let response = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => (response += chunk))
    socket.on('end', () => {
      const { error, ...rest } = JSON.parse(response)
      if (error) reject(new Error(error))
      else resolve(rest)
    })
    socket.on('error', () => reject(new Error('Nara did not respond (was the app closed?)')))
    // Ending the write side tells the server the request is complete.
    socket.end(JSON.stringify({ from: process.env.NARA_PTY, ...body }))
  })
}
