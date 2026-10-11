import { useEffect, useRef, useState } from 'react'
import Shika from './Shika'
import CommandCenter from './CommandCenter'
import { BUILT_IN_PET, PET_SIZES, petSprite } from '../pets'
import { URGENCY, agentName, byUrgency } from '../agentStatus'

// The rows of a Codex pet's sprite sheet, one per animation.
const ROWS = {
  idle: 0,
  right: 1,
  left: 2,
  wave: 3,
  jump: 4,
  failed: 5,
  waiting: 6,
  working: 7,
  review: 8
}
const FRAME = { idle: 220, wave: 160 }
const FRAME_DEFAULT = 130

// How far the pointer can move for a press to still be a click, not a drag.
const SLOP = 4
const POSITION = 'pet-position'

// The pet in the corner of the window, over everything but the dialogs: it shows, in its bubble
// and its animation, what the agents in every open workspace are doing (`statuses`, from main's
// status.js). Clicking it opens the command center, where each agent can be answered or visited
// (onJump); dragging moves it, and it stays where it's left. `pet` is the chosen pet's id
// ('builtin:shika' or a pet folder's).
export default function Pet({ pet, size, statuses, onJump }) {
  const width = PET_SIZES[size]?.px ?? PET_SIZES.m.px
  const [position, setPosition] = useState(recall)
  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState(null)
  const [open, setOpen] = useState(false)
  // A short hop after a click.
  const [jumping, setJumping] = useState(false)
  const press = useRef(null)
  const root = useRef(null)

  useEffect(() => {
    localStorage.setItem(POSITION, JSON.stringify(position))
  }, [position])

  // A click anywhere else, or Escape, puts the command center away.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (!root.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const news = statuses.filter((s) => URGENCY[s.state]).sort(byUrgency)
  const focus = news[0]
  const working = statuses.filter((s) => s.state === 'working').length
  const mood = jumping ? 'jump' : (focus?.state ?? 'idle')

  function onPointerDown(e) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    press.current = { x: e.clientX, y: e.clientY, from: position, moved: false }
  }

  function onPointerMove(e) {
    const start = press.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < SLOP) return
    start.moved = true
    setDrag(e.movementX < 0 ? 'left' : e.movementX > 0 ? 'right' : (drag ?? 'right'))
    setPosition(clamp({ right: start.from.right - dx, bottom: start.from.bottom - dy }, width))
  }

  function onPointerUp() {
    const start = press.current
    press.current = null
    setDrag(null)
    if (!start || start.moved) return
    setJumping(true)
    setTimeout(() => setJumping(false), 700)
    setOpen((current) => !current)
  }

  const bubble = open ? null : focus ? message(focus, working) : hover ? quiet(statuses) : null
  // The bubble and the command center open toward the middle of the window: leftward from a pet
  // on the right half.
  const side = position.right + width / 2 < innerWidth / 2 ? 'left' : 'right'
  const row = drag ?? (hover && !focus && !jumping ? 'wave' : mood)

  return (
    <div
      ref={root}
      className="pet"
      data-mood={mood}
      style={{ right: position.right, bottom: position.bottom, width }}
    >
      {bubble && (
        <div className="pet-bubble" data-state={focus?.state} data-side={side} role="status">
          <span className="pet-bubble-text">{bubble.text}</span>
          {bubble.where && <span className="pet-bubble-where">{bubble.where}</span>}
          {news.length > 1 && <span className="pet-bubble-more">+{news.length - 1}</span>}
        </div>
      )}
      {open && (
        <div className="pet-panel" data-side={side} role="dialog" aria-label="Agents">
          <CommandCenter
            statuses={statuses}
            onJump={(status) => {
              setOpen(false)
              onJump(status)
            }}
          />
        </div>
      )}
      <button
        className="pet-body"
        aria-label={bubble ? bubble.text : 'Agents'}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <PetFigure pet={pet} mood={mood} row={row} width={width} dragging={Boolean(drag)} />
      </button>
    </div>
  )
}

// The pet itself, in a mood: Shika drawn, or a Codex pet's sprite sheet on `row` (its mood's
// animation, or another one, like running while dragged). Until a sheet loads, or if it can't,
// Shika stands in.
export function PetFigure({ pet, mood, row = mood, width, dragging }) {
  // The sheet loaded last, as { pet, sheet }: one for another pet isn't drawn.
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    if (pet === BUILT_IN_PET) return
    let current = true
    petSprite(pet).then((sheet) => current && setLoaded({ pet, sheet }))
    return () => {
      current = false
    }
  }, [pet])

  const sprite = loaded?.pet === pet ? loaded.sheet : null
  return pet === BUILT_IN_PET || !sprite ? (
    <Shika mood={mood} dragging={dragging} />
  ) : (
    <Sprite sprite={sprite} row={row} width={width} />
  )
}

// A cell of the sprite sheet at a time, looping through the frames its row has.
export function Sprite({ sprite, row, width, still }) {
  // Counts up while the row plays; the frame is where that falls in the row.
  const [tick, setTick] = useState(0)
  const counts = sprite.counts
  // A row with no frames (a pet without that animation) falls back to idle.
  const used = counts[ROWS[row]] ? ROWS[row] : 0
  const total = counts[used] || 1

  useEffect(() => {
    if (still || total < 2) return
    const timer = setInterval(() => setTick((t) => t + 1), FRAME[row] ?? FRAME_DEFAULT)
    return () => clearInterval(timer)
  }, [row, total, still])
  const frame = still ? 0 : tick % total

  const height = (width * 208) / 192
  return (
    <span
      className="pet-sprite"
      style={{
        width,
        height,
        backgroundImage: `url(${sprite.url})`,
        backgroundSize: `${width * 8}px ${height * 9}px`,
        backgroundPosition: `${-frame * width}px ${-used * height}px`
      }}
    />
  )
}

// What the bubble says about an agent: who, what, and in which workspace.
function message(status, working) {
  const name = agentName(status)
  const text = {
    waiting: `${name} needs you`,
    failed: `${name} stopped`,
    review: `${name} is done`,
    working: working > 1 ? `${working} agents working` : `${name} is working`
  }[status.state]
  return { text, where: status.state === 'working' && working > 1 ? null : status.workspace }
}

function quiet(statuses) {
  if (!statuses.length) return { text: 'No agents yet' }
  return {
    text: statuses.length === 1 ? '1 agent, all quiet' : `${statuses.length} agents, all quiet`
  }
}

function recall() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION))
    if (Number.isFinite(saved?.right) && Number.isFinite(saved?.bottom)) return saved
  } catch {
    // Nothing saved yet.
  }
  return { right: 28, bottom: 84 }
}

// Keeps the pet inside the window.
function clamp({ right, bottom }, width) {
  return {
    right: Math.round(Math.min(Math.max(right, 0), innerWidth - width)),
    bottom: Math.round(Math.min(Math.max(bottom, 0), innerHeight - width * 1.1))
  }
}
