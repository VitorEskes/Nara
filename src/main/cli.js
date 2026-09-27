import { connect } from 'net'

// The `anbu` command that runs inside canvas terminals. It does nothing on its own: it sends
// the request to the app over the socket in ANBU_SOCK and prints the response. This file is run
// by resources/bin/anbu, with Electron itself acting as Node.

const HELP = `usage:
  anbu peers                    list the terminals linked to this one
  anbu send <terminal> <text>   send the text to a linked terminal
  anbu send <terminal>          with no text, read the message from stdin

The message arrives in the target terminal as if someone had typed it and pressed Enter.
The reply, if any, arrives in this terminal the same way: no need to wait or check for it.`

main().catch((error) => {
  console.error(`anbu: ${error.message}`)
  process.exit(1)
})

async function main() {
  const [command, target, ...words] = process.argv.slice(2)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (!process.env.ANBU_SOCK) throw new Error('run this command inside an anbu terminal')

  if (command === 'peers') {
    const { peers } = await request({ command })
    if (peers.length === 0) console.log('no terminals linked to this one')
    for (const { nodeId, program, canReceive } of peers) {
      const note = canReceive ? '' : "  (shell only, can't receive messages)"
      console.log(`terminal ${nodeId}  ${program}${note}`)
    }
    return
  }

  if (command === 'send') {
    // Accepts "2", "terminal 2" or "terminal2": that's what the node title shows.
    const to = Number(target?.match(/\d+$/)?.[0])
    if (!to) throw new Error('which terminal? e.g. anbu send 2 "hi"')

    let text = words.join(' ')
    if (!text) {
      if (process.stdin.isTTY) throw new Error('missing message, e.g. anbu send 2 "hi"')
      for await (const chunk of process.stdin) text += chunk
    }

    await request({ command, to, text })
    console.log(`delivered to terminal ${to}`)
    return
  }

  throw new Error(`unknown command: ${command}\n\n${HELP}`)
}

function request(body) {
  return new Promise((resolve, reject) => {
    const socket = connect(process.env.ANBU_SOCK)
    let response = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => (response += chunk))
    socket.on('end', () => {
      const { error, ...rest } = JSON.parse(response)
      if (error) reject(new Error(error))
      else resolve(rest)
    })
    socket.on('error', () => reject(new Error('anbu did not respond (was the app closed?)')))
    // Ending the write side tells the server the request is complete.
    socket.end(JSON.stringify({ from: process.env.ANBU_PTY, ...body }))
  })
}
