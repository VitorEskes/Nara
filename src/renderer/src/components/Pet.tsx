import { useEffect, useLayoutEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import Shika from './Shika'
import CommandCenter from './CommandCenter'
import { BUILT_IN_PET, PET_SIZES, petSprite, type Sprite as Sheet } from '../pets'
import { URGENCY, agentName, byUrgency } from '../agentStatus'
import type { AgentStatus, PetConfig } from '../../../shared/types'

// The rows of a Codex pet's sprite sheet, one per animation.
const ROWS: Record<string, number> = {
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
const FRAME: Record<string, number> = { idle: 220, wave: 160 }
const FRAME_DEFAULT = 130

// How far the pointer can move for a press to still be a click, not a drag.
const SLOP = 4
// How far around what's drawn still belongs to the window's shape, for the shadows.
const SHADOW = 10

// The desktop pet (main/petProcess.js): alone on a transparent window over every app, in its
// bottom right corner. It shows, in its bubble and its animation, what the agents in every open
// workspace are doing. Clicking it opens the command center above it, where each agent can be
// answered or visited (Nara comes to the front, on it); dragging it moves the window, which stays
// where it's left. The pet and its size come from the settings, through the app.
//
// Only what's drawn takes the pointer: after every change the pet tells main the rectangles it
// draws in, and the window lets clicks through everywhere else.
export default function Pet(): JSX.Element | null {
  const [prefs, setPrefs] = useState<PetConfig | null>(null)
  const [statuses, setStatuses] = useState<AgentStatus[]>([])
  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState<'left' | 'right' | null>(null)
  const [open, setOpen] = useState(false)
  // A short hop after a click.
  const [jumping, setJumping] = useState(false)
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.pet.prefs().then(setPrefs)
    window.api.agents.status().then(setStatuses)
    const offPrefs = window.api.pet.onPrefs(setPrefs)
    const offStatus = window.api.agents.onStatus(setStatuses)
    // Escape, or a click on another app, puts the command center away.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onBlur = (): void => setOpen(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      offPrefs()
      offStatus()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // The window's shape: the pet, its bubble and its panel, as they are on screen now. The panel's
  // list grows and shrinks as agents come and go, so its size is watched too.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = (): void =>
      window.api.pet.shape(
        [...el.querySelectorAll('.pet-body, .pet-bubble, .pet-panel')].map((part) => {
          const r = part.getBoundingClientRect()
          return {
            x: r.left - SHADOW,
            y: r.top - SHADOW,
            width: r.width + SHADOW * 2,
            height: r.height + SHADOW * 2
          }
        })
      )
    report()
    const observer = new ResizeObserver(report)
    for (const part of el.querySelectorAll('.pet-bubble, .pet-panel')) observer.observe(part)
    return () => observer.disconnect()
  })

  const pet = prefs?.pet
  const width = PET_SIZES[prefs?.size ?? 'm']?.px ?? PET_SIZES.m.px
  const news = statuses.filter((s) => URGENCY[s.state]).sort(byUrgency)
  const focus = news[0]
  const working = statuses.filter((s) => s.state === 'working').length
  const mood = jumping ? 'jump' : (focus?.state ?? 'idle')

  // A press that moves past the slop drags the window; main moves it with the pointer, so the
  // pointer stays put over the page and only its place on the screen says which way it goes.
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    press.current = { x: e.screenX, y: e.screenY, moved: false }
  }

  function onPointerMove(e: PointerEvent): void {
    const start = press.current
    if (!start) return
    const dx = e.screenX - start.x
    if (!start.moved && Math.hypot(dx, e.screenY - start.y) < SLOP) return
    if (!start.moved) {
      start.moved = true
      setOpen(false)
      window.api.pet.dragStart()
    }
    if (dx) setDrag(dx < 0 ? 'left' : 'right')
    start.x = e.screenX
  }

  function onPointerUp(): void {
    const start = press.current
    press.current = null
    setDrag(null)
    if (!start) return
    if (start.moved) return window.api.pet.dragEnd()
    setJumping(true)
    setTimeout(() => setJumping(false), 700)
    setOpen((current) => !current)
  }

  if (!pet) return null
  const bubble = open ? null : focus ? message(focus, working) : hover ? quiet(statuses) : null
  const row = drag ?? (hover && !focus && !jumping ? 'wave' : mood)

  return (
    <div ref={root} className="pet desktop-pet" data-mood={mood} style={{ width }}>
      {bubble && (
        <div className="pet-bubble" data-state={focus?.state} data-side="left" role="status">
          <span className="pet-bubble-text">{bubble.text}</span>
          {bubble.where && <span className="pet-bubble-where">{bubble.where}</span>}
          {news.length > 1 && <span className="pet-bubble-more">+{news.length - 1}</span>}
        </div>
      )}
      {open && (
        <div className="pet-panel" data-side="left" role="dialog" aria-label="Agents">
          <CommandCenter
            statuses={statuses}
            onJump={(status) => {
              setOpen(false)
              window.api.pet.jump(status)
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
export function PetFigure({
  pet,
  mood,
  row = mood,
  width,
  dragging
}: {
  pet: string
  mood: string
  row?: string
  width: number
  dragging?: boolean
}): JSX.Element {
  // The sheet loaded last, as { pet, sheet }: one for another pet isn't drawn.
  const [loaded, setLoaded] = useState<{ pet: string; sheet: Sheet | null } | null>(null)

  useEffect(() => {
    if (pet === BUILT_IN_PET) return
    let current = true
    petSprite(pet).then((sheet) => {
      if (current) setLoaded({ pet, sheet })
    })
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
export function Sprite({
  sprite,
  row,
  width,
  still
}: {
  sprite: Sheet
  row: string
  width: number
  still?: boolean
}): JSX.Element {
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
function message(status: AgentStatus, working: number): { text: string; where?: string | null } {
  const name = agentName(status)
  const text = (
    {
      waiting: `${name} needs you`,
      failed: `${name} stopped`,
      review: `${name} is done`,
      working: working > 1 ? `${working} agents working` : `${name} is working`
    } as Record<string, string>
  )[status.state]
  return { text, where: status.state === 'working' && working > 1 ? null : status.workspace }
}

function quiet(statuses: AgentStatus[]): { text: string; where?: string | null } {
  if (!statuses.length) return { text: 'No agents yet' }
  return {
    text: statuses.length === 1 ? '1 agent, all quiet' : `${statuses.length} agents, all quiet`
  }
}
