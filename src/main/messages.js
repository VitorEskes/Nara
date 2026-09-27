import { ipcMain } from 'electron'
import { rmSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { basename, delimiter, dirname, join } from 'path'
import anbu from '../../resources/bin/anbu?asset'
import { terminais } from './pty'

// Agentes conversam rodando o comando `anbu` no próprio terminal. O comando fala com este
// servidor por um socket, e o servidor cola a mensagem no terminal do outro lado da ligação
// como se alguém tivesse digitado. O agente de lá responde do mesmo jeito.
// O pid no nome deixa dois anbu abertos ao mesmo tempo sem um roubar o socket do outro.
const SOCKET = join(tmpdir(), `anbu-${process.pid}.sock`)

// Terminal com só o shell em primeiro plano não recebe mensagem: o Enter no fim executaria
// o texto como comando.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'nu', 'pwsh'])

// As ligações moram no renderer; ele manda a lista inteira de novo a cada mudança.
let ligacoes = []

export function registrarMensagens(janela) {
  ipcMain.on('ligacoes:definir', (_ev, novas) => {
    ligacoes = novas
  })

  // Um pedido por conexão: o `anbu` escreve o JSON e fecha a escrita; a resposta volta
  // depois do 'end'. allowHalfOpen deixa o servidor escrever depois que o cliente fechou o lado dele.
  const servidor = createServer({ allowHalfOpen: true }, (conexao) => {
    let pedido = ''
    conexao.setEncoding('utf8')
    conexao.on('data', (pedaco) => (pedido += pedaco))
    conexao.on('end', () => {
      let resposta
      try {
        resposta = atender(JSON.parse(pedido), janela)
      } catch (erro) {
        resposta = { erro: erro.message }
      }
      conexao.end(JSON.stringify(resposta))
    })
    conexao.on('error', () => {})
  })
  // Socket de uma execução que morreu sem fechar direito impede o listen.
  rmSync(SOCKET, { force: true })
  servidor.listen(SOCKET)

  janela.on('closed', () => {
    servidor.close()
    ipcMain.removeAllListeners('ligacoes:definir')
  })

  // O que cada terminal precisa ter no ambiente para o `anbu` funcionar lá dentro.
  return {
    PATH: `${dirname(anbu)}${delimiter}${process.env.PATH}`,
    ANBU_SOCK: SOCKET,
    ANBU_ELECTRON: process.execPath,
    ANBU_CLI: join(__dirname, 'cli.js')
  }
}

function atender({ de, comando, para, texto }, janela) {
  const origem = terminais.get(Number(de))
  if (!origem) throw new Error('este terminal não existe mais no anbu')

  // Ligação não tem direção: vale tanto de→para quanto para→de.
  const vizinhos = ligacoes.flatMap((l) =>
    l.de === origem.no ? [l.para] : l.para === origem.no ? [l.de] : []
  )

  if (comando === 'ligados') {
    return {
      ligados: vizinhos.map((no) => {
        const alvo = acharNo(no)
        const programa = alvo && programaDe(alvo)
        return { no, programa, aceita: !SHELLS.has(programa) }
      })
    }
  }

  if (comando === 'enviar') {
    if (!vizinhos.includes(para)) throw new Error(`o terminal ${para} não está ligado a este`)
    const alvo = acharNo(para)
    if (!alvo) throw new Error(`o terminal ${para} não existe mais`)
    if (SHELLS.has(programaDe(alvo))) {
      throw new Error(`o terminal ${para} não está rodando nenhum agente, só o shell`)
    }
    const limpo = limpar(texto)
    if (!limpo.trim()) throw new Error('mensagem vazia')

    // O cabeçalho diz ao agente de lá quem mandou e como responder.
    const cabecalho = `[anbu · mensagem do terminal ${origem.no} · responda com: anbu enviar ${origem.no} "..."]`
    janela.webContents.send('pty:colar', alvo.id, `${cabecalho} ${limpo}`)
    return { ok: true }
  }

  throw new Error(`comando desconhecido: ${comando}`)
}

// Programa em primeiro plano no terminal (o agente, ou o próprio shell se nada estiver rodando).
// O node-pty devolve o argv[0], que às vezes vem com caminho: /usr/bin/zsh.
function programaDe({ term }) {
  return basename(term.process)
}

function acharNo(no) {
  for (const [id, terminal] of terminais) {
    if (terminal.no === no) return { id, ...terminal }
  }
  return null
}

// Tira caracteres de controle (menos \n e \t). Um ESC no texto viraria sequência de teclas
// no terminal de destino: fecharia a colagem no meio e o resto chegaria como digitação.
function limpar(texto = '') {
  // eslint-disable-next-line no-control-regex
  return String(texto).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
}
