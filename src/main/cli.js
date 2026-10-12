import { connect } from 'net'

// The `nara` command that runs inside canvas terminals. It does nothing on its own: it sends
// the request to the app over the socket in NARA_SOCK and prints the response. This file is run
// by resources/bin/nara, with Electron itself acting as Node.

const HELP = `usage:
  nara peers                        list the terminals and notes linked to this one, with roles
  nara send <terminal> <text>       send the text to a linked terminal
  nara note read <note>             print the text of a linked note
  nara note write <note> <text>     replace the note's text
  nara note append <note> <text>    add the text to the end of the note, on a new line

Without <text>, send, write and append read it from stdin.

A message arrives in the target terminal as if someone had typed it and pressed Enter.
The reply, if any, arrives in this terminal the same way: no need to wait or check for it.
A note is shared text on the canvas: anyone linked to it can read it, and so can the user.`

// `nara hook <event>` is run by Claude Code's hooks (main/pty.js), not by hand: it tells Nara what
// the agent just did. It never fails out loud, since an error would show up in the agent.
if (process.argv[2] === 'hook') {
  hook(process.argv[3]).finally(() => process.exit(0))
} else {
  main().catch((error) => {
    console.error(`nara: ${error.message}`)
    process.exit(1)
  })
}

async function hook(event) {
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
  const timeout = new Promise((resolve) => setTimeout(resolve, 2000))
  await Promise.race([request({ command: 'hook', event, payload }).catch(() => {}), timeout])
}

async function main() {
  const [command, ...args] = process.argv.slice(2)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (!process.env.NARA_SOCK) throw new Error('run this command inside a Nara terminal')

  if (command === 'peers') {
    const { peers } = await request({ command })
    if (peers.length === 0) console.log('nothing linked to this terminal')
    for (const { nodeId, type, title, program, role, canReceive } of peers) {
      // A node the user renamed shows its name after the id, which is still what commands take.
      const name = title && title !== `${type} ${nodeId}` ? `  "${title}"` : ''
      if (type === 'note') {
        console.log(`note ${nodeId}${name}`)
        continue
      }
      const roleName = role ? `  (${role})` : ''
      const warning = canReceive ? '' : "  (shell only, can't receive messages)"
      console.log(`terminal ${nodeId}${name}  ${program}${roleName}${warning}`)
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
    if (!['read', 'write', 'append'].includes(action)) {
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

  throw new Error(`unknown command: ${command}\n\n${HELP}`)
}

// Accepts "2", "terminal 2" or "note2": the number is what the node title shows.
function nodeNumber(target, hint) {
  const id = Number(target?.match(/\d+$/)?.[0])
  if (!id) throw new Error(hint)
  return id
}

// The text given as arguments or, with none, whatever comes in on stdin. An empty argument
// counts: `nara note write 2 ""` clears the note.
async function readText(words, hint) {
  if (words.length > 0) return words.join(' ')
  if (process.stdin.isTTY) throw new Error(hint)
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}

function request(body) {
  return new Promise((resolve, reject) => {
    const socket = connect(process.env.NARA_SOCK)
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
