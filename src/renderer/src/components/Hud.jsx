import { useEffect, useState } from 'react'
import CommandCenter from './CommandCenter'
import { PetFigure } from './Pet'
import { BrandMark, CloseIcon } from './icons'
import { URGENCY, byUrgency } from '../agentStatus'

// The floating HUD (main/hud.js): the pet and its command center in a small window over every
// app, summoned with the global shortcut. Escape or the close button puts it away; going to an
// agent brings Nara to the front, on that agent.
export default function Hud() {
  const [statuses, setStatuses] = useState([])
  // The pet chosen in the settings, read again each time the HUD comes up.
  const [pet, setPet] = useState(chosenPet)

  useEffect(() => {
    window.api.agents.status().then(setStatuses)
    const off = window.api.agents.onStatus(setStatuses)
    const onFocus = () => setPet(chosenPet())
    const onKeyDown = (e) => e.key === 'Escape' && window.api.hud.hide()
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
        <button
          className="icon-button"
          aria-label="Close"
          title="Close (Esc)"
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

function chosenPet() {
  try {
    const prefs = JSON.parse(localStorage.getItem('prefs'))
    return prefs && 'pet' in prefs ? prefs.pet : 'builtin:shika'
  } catch {
    return 'builtin:shika'
  }
}
