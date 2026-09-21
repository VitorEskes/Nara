import { useState } from 'react'
import Canvas from './components/Canvas'
import No from './components/No'
import Terminal from './components/Terminal'

export default function App() {
  const [nos] = useState([
    { id: 1, x: 80, y: 80, w: 640, h: 400, titulo: 'shell' },
    { id: 2, x: 780, y: 160, w: 640, h: 400, titulo: 'shell 2' }
  ])

  return (
    <Canvas>
      {nos.map((no) => (
        <No key={no.id} {...no}>
          <Terminal />
        </No>
      ))}
    </Canvas>
  )
}
