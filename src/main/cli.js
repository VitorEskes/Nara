import { connect } from 'net'

// O comando `anbu`, que roda dentro dos terminais do canvas. Não faz nada sozinho: manda o
// pedido para o app pelo socket em ANBU_SOCK e mostra a resposta. Quem roda este arquivo é o
// resources/bin/anbu, com o próprio Electron fazendo papel de Node.

const AJUDA = `uso:
  anbu ligados                    lista os terminais ligados a este
  anbu enviar <terminal> <texto>  manda o texto para um terminal ligado
  anbu enviar <terminal>          sem texto, lê a mensagem da entrada padrão

A mensagem chega no terminal de destino como se alguém tivesse digitado e apertado Enter.
A resposta, se vier, chega neste terminal do mesmo jeito: não precisa esperar nem conferir.`

main().catch((erro) => {
  console.error(`anbu: ${erro.message}`)
  process.exit(1)
})

async function main() {
  const [comando, alvo, ...palavras] = process.argv.slice(2)

  if (!comando || comando === 'ajuda' || comando === '--help' || comando === '-h') {
    console.log(AJUDA)
    return
  }
  if (!process.env.ANBU_SOCK) throw new Error('rode este comando dentro de um terminal do anbu')

  if (comando === 'ligados') {
    const { ligados } = await pedir({ comando })
    if (ligados.length === 0) console.log('nenhum terminal ligado a este')
    for (const { no, programa, aceita } of ligados) {
      const aviso = aceita ? '' : '  (só o shell, não recebe mensagens)'
      console.log(`terminal ${no}  ${programa}${aviso}`)
    }
    return
  }

  if (comando === 'enviar') {
    // Aceita "2", "terminal 2" ou "terminal2": é o que aparece no título do nó.
    const para = Number(alvo?.match(/\d+$/)?.[0])
    if (!para) throw new Error('diga para qual terminal, ex.: anbu enviar 2 "oi"')

    let texto = palavras.join(' ')
    if (!texto) {
      if (process.stdin.isTTY) throw new Error('faltou a mensagem, ex.: anbu enviar 2 "oi"')
      for await (const pedaco of process.stdin) texto += pedaco
    }

    await pedir({ comando, para, texto })
    console.log(`entregue ao terminal ${para}`)
    return
  }

  throw new Error(`comando desconhecido: ${comando}\n\n${AJUDA}`)
}

function pedir(pedido) {
  return new Promise((resolver, rejeitar) => {
    const socket = connect(process.env.ANBU_SOCK)
    let resposta = ''
    socket.setEncoding('utf8')
    socket.on('data', (pedaco) => (resposta += pedaco))
    socket.on('end', () => {
      const { erro, ...resto } = JSON.parse(resposta)
      if (erro) rejeitar(new Error(erro))
      else resolver(resto)
    })
    socket.on('error', () => rejeitar(new Error('o anbu não respondeu (o app foi fechado?)')))
    // Fechar a escrita avisa o servidor que o pedido acabou.
    socket.end(JSON.stringify({ de: process.env.ANBU_PTY, ...pedido }))
  })
}
