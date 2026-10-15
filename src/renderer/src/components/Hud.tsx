import { useEffect, useState, type JSX } from 'react'
import CommandCenter from './CommandCenter'
import { PetFigure } from './Pet'
import { BrandMark, CloseIcon, MicIcon } from './icons'
import { URGENCY, byUrgency } from '../agentStatus'
import { tip } from '../tip'
import { VOICE } from '../../../shared/features'
import type { AgentStatus } from '../../../shared/types'

// The floating HUD (main/hud.js): the pet and its command center in a small window over every
// app, summoned with the global shortcut. Escape or the close button puts it away; going to an
// agent brings Nara to the front, on that agent.
export default function Hud(): JSX.Element {
  const [statuses, setStatuses] = useState<AgentStatus[]>([])
  // The pet chosen in the settings, read again each time the HUD comes up.
  const [pet, setPet] = useState<string | null>(chosenPet)

  useEffect(() => {
    window.api.agents.status().then(setStatuses)
    const off = window.api.agents.onStatus(setStatuses)
    const onFocus = (): void => setPet(chosenPet())
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.hud.hide()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const focus = statuses.filter((s) => URGENCY[s.state]).sort(byUrgency)[0]
  return (
    <div className="hud-card">
      <header className="hud-head">
        <span className="hud-pet">
          {pet ? <PetFigure pet={pet} mood={focus?.state ?? 'idle'} width={52} /> : <BrandMark />}
        </span>
        <h1>Agents</h1>
        {VOICE && (
          <button
            className="icon-button"
            {...tip('Dictate to an agent', 'Ctrl+Alt+V', 'bottom')}
            onClick={() => {
              window.api.hud.hide()
              window.api.voice.open(
                focus ? { workspaceId: focus.workspaceId, nodeId: focus.nodeId } : null
              )
            }}
          >
            <MicIcon />
          </button>
        )}
        <button
          className="icon-button"
          {...tip('Close', 'Esc', 'bottom')}
          onClick={() => window.api.hud.hide()}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="hud-body">
        <CommandCenter statuses={statuses} onJump={(status) => window.api.hud.jump(status)} />
      </div>
    </div>
  )
}

function chosenPet(): string | null {
  try {
    const prefs = JSON.parse(localStorage.getItem('prefs') ?? 'null')
    return prefs && 'pet' in prefs ? prefs.pet : 'builtin:shika'
  } catch {
    return 'builtin:shika'
  }
}
