import { useEffect, useRef, useState } from 'react'
import NodeIcon from './NodeIcon'
import { CloseIcon, CopyIcon, MicIcon, SendIcon, StopIcon } from './icons'
import { URGENCY, agentKey, agentName, byUrgency } from '../agentStatus'
import { record } from '../recorder'

// How many bars the level meter keeps.
const BARS = 40

// The voice bar (main/voice.js): opens listening; Enter or the stop button ends the recording and
// it turns into text, which can be fixed before it goes to an agent, the one picked under it.
// Escape puts the bar away. It can also just copy the text, for anywhere else.
export default function VoiceBar() {
  // 'listening', 'transcribing', 'ready', 'error' or 'idle'.
  const [phase, setPhase] = useState('idle')
  const [levels, setLevels] = useState(() => Array(BARS).fill(0))
  const [seconds, setSeconds] = useState(0)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [agents, setAgents] = useState([])
  const [target, setTarget] = useState(null)
  const [sent, setSent] = useState(null)
  // How far the voice model's first download has got, while it's downloading.
  const [download, setDownload] = useState(null)
  const session = useRef(null)
  const field = useRef(null)

  async function start() {
    session.current?.cancel()
    setText('')
    setError(null)
    setSent(null)
    setSeconds(0)
    setLevels(Array(BARS).fill(0))
    try {
      let last = 0
      session.current = await record((level) => {
        const now = performance.now()
        if (now - last < 50) return
        last = now
        setLevels((current) => [...current.slice(1), level])
      })
      setPhase('listening')
    } catch (e) {
      setError(`The microphone isn't available: ${e.message}`)
      setPhase('error')
    }
  }

  async function stop() {
    const current = session.current
    if (!current) return
    session.current = null
    setPhase('transcribing')
    try {
      const audio = await current.stop()
      const result = await window.api.voice.transcribe(audio)
      if (result.error) throw new Error(result.error)
      setDownload(null)
      setText(result.text)
      setPhase(result.text ? 'ready' : 'error')
      if (!result.text) setError('Nothing was heard. Try again a little closer to the microphone.')
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  function close() {
    session.current?.cancel()
    session.current = null
    setPhase('idle')
    window.api.voice.hide()
  }

  async function send() {
    const agent = agents.find((a) => agentKey(a) === target)
    if (!agent || !text.trim()) return
    const ok = await window.api.agents.reply(agent.workspaceId, agent.nodeId, {
      kind: 'text',
      text
    })
    setSent(ok ? `Sent to ${agentName(agent)}` : 'Couldn’t send it')
    if (ok) setTimeout(close, 700)
  }

  async function copy() {
    await navigator.clipboard.writeText(text)
    setSent('Copied')
    setTimeout(close, 500)
  }

  // Every time the bar opens: the agents as they are now, the one to send to, and listening.
  const latest = useRef({ start })
  useEffect(() => {
    latest.current = { start }
  })
  useEffect(() => {
    async function open(preferred) {
      const list = (await window.api.agents.status()).sort(byUrgency)
      setAgents(list)
      const wanted = preferred && list.find((a) => agentKey(a) === agentKey(preferred))
      const pick = wanted ?? list.find((a) => URGENCY[a.state] >= 2) ?? list[0]
      setTarget(pick ? agentKey(pick) : null)
      latest.current.start()
    }
    const off = window.api.voice.onOpened(open)
    // The first opening loads the page, and may come before this listens.
    window.api.voice.take().then((opening) => opening && open(opening.target))
    return off
  }, [])

  useEffect(() => window.api.voice.onProgress((share) => setDownload(share < 1 ? share : null)), [])

  useEffect(() => {
    if (phase !== 'listening') return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === 'ready') field.current?.focus()
  }, [phase])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (phase === 'listening' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <div className="voice-bar" data-phase={phase}>
      <div className="voice-main">
        <button
          className="voice-mic"
          aria-label={phase === 'listening' ? 'Stop and transcribe' : 'Record again'}
          title={phase === 'listening' ? 'Stop · Enter' : 'Record again'}
          onClick={phase === 'listening' ? stop : start}
          disabled={phase === 'transcribing'}
        >
          {phase === 'listening' ? <StopIcon size={14} /> : <MicIcon size={18} />}
        </button>

        {phase === 'listening' || phase === 'transcribing' ? (
          <div className="voice-meter" aria-hidden="true">
            {levels.map((level, i) => (
              <span key={i} style={{ '--level': phase === 'transcribing' ? 0.08 : level }} />
            ))}
          </div>
        ) : phase === 'ready' ? (
          <textarea
            ref={field}
            className="voice-text"
            aria-label="Message"
            value={text}
            rows={2}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
        ) : (
          <p className="voice-message">{error ?? 'Starting the microphone…'}</p>
        )}

        <span className="voice-status">
          {phase === 'listening'
            ? time
            : phase === 'transcribing'
              ? download != null
                ? `Getting the voice model · ${Math.round(download * 100)}%`
                : 'Transcribing…'
              : ''}
        </span>
        <button className="icon-button" aria-label="Close" title="Close · Esc" onClick={close}>
          <CloseIcon />
        </button>
      </div>

      <div className="voice-foot">
        <div className="voice-targets" role="radiogroup" aria-label="Send to">
          {agents.length === 0 && (
            <span className="voice-hint">No agents open: copy the text instead</span>
          )}
          {agents.map((agent) => (
            <button
              key={agentKey(agent)}
              role="radio"
              aria-checked={target === agentKey(agent)}
              className="voice-target"
              data-state={agent.state}
              onClick={() => setTarget(agentKey(agent))}
            >
              <NodeIcon type="terminal" agent={agent.agent} size={12} />
              {agentName(agent)}
              <span className="state-dot" />
            </button>
          ))}
        </div>
        {sent ? (
          <span className="voice-sent">{sent}</span>
        ) : (
          <div className="voice-actions">
            <button
              className="icon-button"
              title="Copy"
              aria-label="Copy"
              disabled={phase !== 'ready'}
              onClick={copy}
            >
              <CopyIcon />
            </button>
            <button
              className="button primary small"
              disabled={phase !== 'ready' || !target || !text.trim()}
              onClick={send}
            >
              <SendIcon size={14} />
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
