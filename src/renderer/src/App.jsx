import Canvas from './components/Canvas'

export default function App() {
  return (
    <Canvas>
      <div className="caixa-teste" style={{ left: 100, top: 100 }}>
        <h1>Anbu</h1>
      </div>
      <div className="caixa-teste" style={{ left: 500, top: 300, background: '#7c5cff' }} />
    </Canvas>
  )
}
