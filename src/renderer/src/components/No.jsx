// Uma caixa no mundo: posição e tamanho em coordenadas do mundo, não da tela.
export default function No({ x, y, w, h, titulo, children }) {
  return (
    <div className="no" style={{ left: x, top: y, width: w, height: h }}>
      <div className="no-barra">{titulo}</div>
      <div className="no-conteudo">{children}</div>
    </div>
  )
}
