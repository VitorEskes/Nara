import { useEffect, useRef, useState } from 'react'
import Canvas from './components/Canvas'
import Ligacoes from './components/Ligacoes'
import No from './components/No'
import Terminal from './components/Terminal'

const LARGURA = 640
const ALTURA = 400

export default function App() {
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 })
  const [nos, setNos] = useState([
    { id: 1, x: 80, y: 80, w: LARGURA, h: ALTURA, camada: 1, titulo: 'terminal 1' }
  ])
  // Ligações não têm direção por enquanto: de/para só dizem de qual nó o arrasto saiu.
  const [ligacoes, setLigacoes] = useState([])
  // Linha que está sendo puxada: nó de origem, ponta no mundo e o nó válido sob o cursor (ou null).
  const [rascunho, setRascunho] = useState(null)
  const proximoId = useRef(2)
  const proximaLigacao = useRef(1)
  const topo = useRef(1)
  // O arrasto de ligação lê a câmera pelos listeners; o ref evita pegar uma câmera velha
  // se o usuário der zoom no meio do arrasto.
  const camAtual = useRef(cam)
  useEffect(() => {
    camAtual.current = cam
  }, [cam])

  function mudar(id, mudancas) {
    setNos((atuais) => atuais.map((no) => (no.id === id ? { ...no, ...mudancas } : no)))
  }

  // Traz para frente mudando só o z-index. Reordenar o array faria o React mover o elemento
  // no DOM, e o terminal lá dentro perderia o foco.
  function focar(id) {
    const no = nos.find((n) => n.id === id)
    if (no.camada === topo.current) return
    mudar(id, { camada: ++topo.current })
  }

  // Cria um terminal centralizado no ponto (em coordenadas do mundo), já na frente dos outros.
  function criar(centro) {
    const id = proximoId.current++
    const novo = {
      id,
      x: Math.round(centro.x - LARGURA / 2),
      y: Math.round(centro.y - ALTURA / 2),
      w: LARGURA,
      h: ALTURA,
      camada: ++topo.current,
      titulo: `terminal ${id}`
    }
    setNos((atuais) => [...atuais, novo])
  }

  // Centro da janela convertido para o mundo: mundo = (tela - (x, y)) / z.
  function criarNoCentro() {
    criar({
      x: (window.innerWidth / 2 - cam.x) / cam.z,
      y: (window.innerHeight / 2 - cam.y) / cam.z
    })
  }

  // Tirar o nó do estado desmonta o <Terminal>, e a limpeza dele mata o PTY.
  function fechar(id) {
    setNos((atuais) => atuais.filter((no) => no.id !== id))
    setLigacoes((atuais) => atuais.filter((l) => l.de !== id && l.para !== id))
  }

  // Arrastar da porta de um nó até outro nó cria uma ligação entre os dois.
  function ligar(de, e) {
    if (e.button !== 0) return
    // Sem isto o pointerdown sobe para a barra e o nó começa a ser movido.
    e.stopPropagation()
    const porta = e.currentTarget
    porta.setPointerCapture(e.pointerId)

    // Com o ponteiro capturado, o alvo dos eventos é sempre a porta; para saber o que está
    // embaixo do cursor é preciso perguntar ao documento.
    function noSob(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.no')
      const id = Number(el?.dataset.id)
      return id && id !== de ? id : null
    }

    // O viewport ocupa a janela toda, então clientX/Y já são coordenadas de tela.
    function paraMundo(ev) {
      const c = camAtual.current
      return { x: (ev.clientX - c.x) / c.z, y: (ev.clientY - c.y) / c.z }
    }

    function aoMover(ev) {
      setRascunho({ de, ...paraMundo(ev), alvo: noSob(ev) })
    }

    function aoSoltar(ev) {
      porta.removeEventListener('pointermove', aoMover)
      porta.removeEventListener('pointerup', aoSoltar)
      porta.removeEventListener('pointercancel', aoSoltar)
      setRascunho(null)

      const para = ev.type === 'pointerup' ? noSob(ev) : null
      if (!para) return
      setLigacoes((atuais) => {
        const repetida = atuais.some(
          (l) => (l.de === de && l.para === para) || (l.de === para && l.para === de)
        )
        return repetida ? atuais : [...atuais, { id: proximaLigacao.current++, de, para }]
      })
    }

    porta.addEventListener('pointermove', aoMover)
    porta.addEventListener('pointerup', aoSoltar)
    porta.addEventListener('pointercancel', aoSoltar)
  }

  function desligar(id) {
    setLigacoes((atuais) => atuais.filter((l) => l.id !== id))
  }

  return (
    <>
      <Canvas cam={cam} setCam={setCam}>
        <Ligacoes nos={nos} ligacoes={ligacoes} rascunho={rascunho} aoRemover={desligar} />
        {nos.map((no) => (
          <No
            key={no.id}
            {...no}
            alvo={rascunho?.alvo === no.id}
            aoMudar={(mudancas) => mudar(no.id, mudancas)}
            aoFocar={() => focar(no.id)}
            aoFechar={() => fechar(no.id)}
            aoLigar={(e) => ligar(no.id, e)}
          >
            <Terminal aoTerminar={() => fechar(no.id)} />
          </No>
        ))}
      </Canvas>

      <div className="ferramentas">
        <button onClick={criarNoCentro}>+ Terminal</button>
      </div>

      {nos.length === 0 && (
        <div className="vazio">Clique em “+ Terminal” para abrir um terminal</div>
      )}
    </>
  )
}
