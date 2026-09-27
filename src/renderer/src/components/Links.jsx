// Linhas entre nós, desenhadas num <svg> dentro do .mundo: as coordenadas já são as do mundo,
// então pan e zoom vêm de graça pelo transform da câmera.
// Fica atrás dos nós (z-index 0) e liga centro a centro: o trecho que passaria por dentro
// de cada nó fica escondido, e a linha parece sair da borda sem precisar calcular a borda.
export default function Ligacoes({ nos, ligacoes, rascunho, aoRemover }) {
  const centros = new Map(nos.map((no) => [no.id, { x: no.x + no.w / 2, y: no.y + no.h / 2 }]))

  return (
    <svg className="ligacoes" width="1" height="1">
      {ligacoes.map((l) => {
        const a = centros.get(l.de)
        const b = centros.get(l.para)
        if (!a || !b) return null
        return (
          <g key={l.id} className="ligacao" onClick={() => aoRemover(l.id)}>
            <title>Clique para desligar</title>
            {/* Traço largo e invisível: área de clique maior que a linha fina. */}
            <line className="ligacao-toque" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line className="ligacao-linha" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          </g>
        )
      })}

      {rascunho && centros.has(rascunho.de) && (
        <line
          className="ligacao-rascunho"
          x1={centros.get(rascunho.de).x}
          y1={centros.get(rascunho.de).y}
          x2={rascunho.x}
          y2={rascunho.y}
        />
      )}
    </svg>
  )
}
