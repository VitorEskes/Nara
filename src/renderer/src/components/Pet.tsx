import { useEffect, useLayoutEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import Shika from './Shika'
import CommandCenter from './CommandCenter'
import { CloseIcon } from './icons'
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
// How far around the pet its part of the window's shape reaches: it hops out of its box.
const HOP = 16
// Room around the bubble and the panel in the shape, for their animations, which move them a few
// pixels out of their boxes.
const SWAY = 6
// How long the bubble and the panel take to go away (main.css's bubble-out), in ms.
const LEAVE = 140
// How long the pointer can be off the pet and its bubble before the hover ends, in ms: moving from
// one to the other, or the window's shape changing under it, doesn't count as leaving.
const HOVER_LEAVE = 220

// The desktop pet (main/petProcess.ts), alone on a transparent window over every app. Its bubble
// and animation show what the agents in every open workspace are doing; a click opens the command
// center, where each agent can be answered or visited, and a drag moves the window. The bubble and
// the panel have a close button that puts the pet away (the settings bring it back).
//
// After every change it tells main the rectangles it draws in, and the window lets clicks through
// everywhere else.
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
  const hoverEnd = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The shape main has, so it's only sent again when it changes.
  const sent = useRef('')

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
      clearTimeout(hoverEnd.current)
    }
  }, [])

  const pet = prefs?.pet
  const width = PET_SIZES[prefs?.size ?? 'm']?.px ?? PET_SIZES.m.px
  const news = statuses.filter((s) => URGENCY[s.state]).sort(byUrgency)
  const focus = news[0]
  const working = statuses.filter((s) => s.state === 'working').length
  const mood = jumping ? 'jump' : (focus?.state ?? 'idle')
  const bubble = open ? null : focus ? message(focus, working) : hover ? quiet(statuses) : null
  // The bubble and the panel stay a moment after they're put away, to fade out; the bubble keeps
  // what it last said while it does.
  const bubbleShown = usePresence(Boolean(bubble))
  const panelShown = usePresence(open)
  const [said, setSaid] = useState(bubble)
  if (bubble && (bubble.text !== said?.text || bubble.where !== said?.where)) setSaid(bubble)

  // The window's shape: the pet, its bubble and its panel. Measured from their boxes in the page,
  // not from the screen, so a part that's growing into place or fading out counts at its full
  // size: the window would otherwise cut it while it moves. The panel's list grows and shrinks as
  // agents come and go, so its size is watched too.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = (): void => {
      const base = el.getBoundingClientRect()
      const rects = [...el.querySelectorAll<HTMLElement>('.pet-body, .pet-bubble, .pet-panel')].map(
        (part) => {
          const room = part.classList.contains('pet-body') ? HOP : SWAY
          return {
            x: base.left + part.offsetLeft - room,
            y: base.top + part.offsetTop - room,
            width: part.offsetWidth + room * 2,
            height: part.offsetHeight + room * 2
          }
        }
      )
      const json = JSON.stringify(rects)
      if (json === sent.current) return
      sent.current = json
      window.api.pet.shape(rects)
    }
    report()
    const observer = new ResizeObserver(report)
    for (const part of el.querySelectorAll('.pet-bubble, .pet-panel')) observer.observe(part)
    return () => observer.disconnect()
  })

  // The hover ends a moment after the pointer leaves the pet and its bubble, unless it comes back.
  function hoverStart(): void {
    clearTimeout(hoverEnd.current)
    setHover(true)
  }

  function hoverStop(): void {
    clearTimeout(hoverEnd.current)
    hoverEnd.current = setTimeout(() => setHover(false), HOVER_LEAVE)
  }

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
  const row = drag ?? (hover && !focus && !jumping ? 'wave' : mood)
  const close = (
    <button
      className="pet-close"
      aria-label="Hide the pet"
      title="Hide the pet (Settings bring it back)"
      onClick={() => window.api.pet.close()}
    >
      <CloseIcon size={11} />
    </button>
  )

  return (
    <div ref={root} className="pet desktop-pet" data-mood={mood} style={{ width }}>
      {bubbleShown && said && (
        <div
          className="pet-bubble"
          data-state={focus?.state}
          data-side="left"
          data-leaving={bubbleShown === 'leaving' || undefined}
          role="status"
          onPointerEnter={hoverStart}
          onPointerLeave={hoverStop}
        >
          <span className="pet-bubble-text">{said.text}</span>
          {said.where && <span className="pet-bubble-where">{said.where}</span>}
          {news.length > 1 && <span className="pet-bubble-more">+{news.length - 1}</span>}
          {close}
        </div>
      )}
      {panelShown && (
        <div
          className="pet-panel"
          data-side="left"
          data-leaving={panelShown === 'leaving' || undefined}
          role="dialog"
          aria-label="Agents"
        >
          {close}
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
        onPointerEnter={hoverStart}
        onPointerLeave={hoverStop}
      >
        <PetFigure pet={pet} mood={mood} row={row} width={width} dragging={Boolean(drag)} />
      </button>
    </div>
  )
}

// Whether something shown while `on` is on screen: true while it's on, 'leaving' for a moment
// after it goes off (while it fades out), then false. Turning it on again while it leaves keeps it.
function usePresence(on: boolean): boolean | 'leaving' {
  const [mounted, setMounted] = useState(on)
  if (on && !mounted) setMounted(true)
  useEffect(() => {
    if (on || !mounted) return
    const timer = setTimeout(() => setMounted(false), LEAVE)
    return () => clearTimeout(timer)
  }, [on, mounted])
  return on ? true : mounted ? 'leaving' : false
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
