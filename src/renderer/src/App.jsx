import { useRef, useState } from 'react'
import Canvas from './components/Canvas'
import No from './components/No'
import Terminal from './components/Terminal'

const LARGURA = 640
const ALTURA = 400

export default function App() {
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 })
  const [nos, setNos] = useState([
    { id: 1, x: 80, y: 80, w: LARGURA, h: ALTURA, camada: 1, titulo: 'terminal 1' }
  ])
  const proximoId = useRef(2)
  const topo = useRef(1)

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
  }

  return (
    <>
      <Canvas cam={cam} setCam={setCam}>
        {nos.map((no) => (
          <No
            key={no.id}
            {...no}
            aoMudar={(mudancas) => mudar(no.id, mudancas)}
            aoFocar={() => focar(no.id)}
            aoFechar={() => fechar(no.id)}
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
