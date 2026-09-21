import { useRef, useState } from 'react'
import Canvas from './components/Canvas'
import No from './components/No'
import Terminal from './components/Terminal'

export default function App() {
  const [nos, setNos] = useState([
    { id: 1, x: 80, y: 80, w: 640, h: 400, camada: 1, titulo: 'shell' },
    { id: 2, x: 780, y: 160, w: 640, h: 400, camada: 2, titulo: 'shell 2' }
  ])
  const topo = useRef(2)

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

  return (
    <Canvas>
      {nos.map((no) => (
        <No
          key={no.id}
          {...no}
          aoMudar={(mudancas) => mudar(no.id, mudancas)}
          aoFocar={() => focar(no.id)}
        >
          <Terminal />
        </No>
      ))}
    </Canvas>
  )
}
