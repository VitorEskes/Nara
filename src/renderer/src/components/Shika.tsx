import type { JSX } from 'react'

// Shika, the Nara deer from the app's icon, as the built-in pet, in pixel art: a 24x26 grid,
// drawn as SVG rects so it stays crisp at any size. Each part is its own layer on the same grid,
// so main.css can move it on its own for each `mood` (idle, working, waiting, review, failed,
// jump) and while it's `dragging`, always by whole pixels.

const WIDTH = 24
const HEIGHT = 26

// What each letter in the grids paints; a dot is see-through.
const PALETTE: Record<string, string> = {
  K: '#2b2d2b', // antlers and hooves
  G: '#474a46', // antlers in the light
  D: '#24503d', // outline and legs
  F: '#3f8462', // fur
  H: '#5a9e7b', // fur in the light
  M: '#2d6249', // ears
  L: '#7ab893', // spots
  E: '#1d201e', // eyes and mouth
  B: '#8aa7d6' // a drop of sweat
}

// Each grid lists the rows it paints from `top` down.
interface Layer {
  top: number
  rows: string[]
}

const ANTLERS: Layer = {
  top: 0,
  rows: [
    '.GK..GK..........GK..GK.',
    '.KK..KK..G....G..KK..KK.',
    '.KKKKKK.KK....KK.KKKKKK.',
    '..KKKKKKKK....KKKKKKKK..',
    '....KKKKK......KKKKK....',
    '......KK........KK......',
    '.......KK......KK.......'
  ]
}

// The head and the ears, with fur where the eyes go, for when they're closed.
const HEAD: Layer = {
  top: 7,
  rows: [
    '.........DDDDDD.........',
    '...DD..DDHHFFFFDD..DD...',
    '...DMMDFHHFFFFFFFDMMD...',
    '....DMDFHFFFFFFFFDMD....',
    '.....DDFFFFFFFFFFDD.....',
    '......DFFFFFFFFFFD......',
    '......DFFFDFFDFFFD......',
    '.......DFFFEEFFFD.......',
    '........DFFFFFFD........',
    '.........DDDDDD.........'
  ]
}

const EYES_OPEN: Layer = {
  top: 10,
  rows: ['.........E....E.........', '.........E....E.........']
}

const EYES_CLOSED: Layer = {
  top: 11,
  rows: ['.........E....E.........']
}

// Only shown when an agent failed.
const DROP: Layer = {
  top: 4,
  rows: ['......................B.', '.....................BB.', '.....................BB.']
}

// The body, turned a little to the right: the front legs under the chest, the back legs and
// the tail behind, the far leg of each pair in shade. The head covers its top row.
const BODY: Layer = {
  top: 16,
  rows: [
    '........DDDDDDDD........',
    '.......DHHFFFFFFDDD.....',
    '......DHFFFFFFLFFFFD.DD.',
    '......DFFFFFFFFFLFFFDLD.',
    '......DFFFFFLFFFFFFFDD..',
    '......DFFFFFFFFFFLFFD...',
    '......DFFMFFFFFFFMFFD...',
    '......DFFMFFDDDDDMFFD...',
    '.......DFMFD....DMFD....',
    '.......DKKKD....DKKD....'
  ]
}

export default function Shika({
  mood = 'idle',
  dragging
}: {
  mood?: string
  dragging?: boolean
}): JSX.Element {
  return (
    <svg
      className="shika"
      data-mood={mood}
      data-dragging={dragging || undefined}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="shika-sprite">
        <Pixels className="shika-body" layer={BODY} />
        <g className="shika-head">
          <Pixels className="shika-antlers" layer={ANTLERS} />
          <Pixels layer={HEAD} />
          <Pixels className="shika-eyes" layer={EYES_OPEN} />
          <Pixels className="shika-eyes-closed" layer={EYES_CLOSED} />
          <Pixels className="shika-drop" layer={DROP} />
        </g>
      </g>
    </svg>
  )
}

// A layer as rects, one for each run of the same color in a row.
function Pixels({ layer, className }: { layer: Layer; className?: string }): JSX.Element {
  const rects: JSX.Element[] = []
  layer.rows.forEach((row, i) => {
    const y = layer.top + i
    let x = 0
    while (x < row.length) {
      const color = PALETTE[row[x]]
      let end = x + 1
      while (end < row.length && row[end] === row[x]) end++
      if (color) {
        rects.push(<rect key={`${x},${y}`} x={x} y={y} width={end - x} height={1} fill={color} />)
      }
      x = end
    }
  })
  return <g className={className}>{rects}</g>
}
