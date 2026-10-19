import { useState, type JSX } from 'react'
import { BugIcon, CloseIcon, CrosshairIcon, SendIcon } from './icons'
import type { ConsoleLine, NodeId, PickedElement } from '../../../shared/types'

// What the user is about to tell an agent about a browser's page: an element they clicked on it,
// with its screenshot once it's taken (a path, or null if it couldn't be), or the console's
// errors.
export type Subject =
  | { kind: 'element'; element: PickedElement; shot?: string | null }
  | { kind: 'errors'; errors: ConsoleLine[] }

// An agent that can be told: its node, its name, and whether it's linked to the browser.
export interface Recipient {
  id: NodeId
  label: string
  linked: boolean
}

// How many of the console's errors go in a message, and how much of each.
const MAX_ERRORS = 20
const MAX_ERROR_TEXT = 500

// Over the bottom of a browser's page: what the message is about, a line or two from the user, and
// the agent it goes to (the first one linked to the browser, at first). Ctrl+Enter sends it,
// Escape puts it away. onSend(to, text) delivers it and says whether it went.
export default function BrowserComposer({
  subject,
  page,
  browser,
  agents,
  onSend,
  onClose
}: {
  subject: Subject
  page: { url: string; title: string }
  browser: string
  agents: Recipient[]
  onSend: (to: NodeId, text: string) => Promise<boolean>
  onClose: () => void
}): JSX.Element {
  const [text, setText] = useState('')
  const [to, setTo] = useState<NodeId | null>(agents[0]?.id ?? null)
  const [failed, setFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const target = agents.find((a) => a.id === to) ?? agents[0]
  // About an element, the user says what they want; errors speak for themselves.
  const ready = Boolean(target) && (subject.kind === 'errors' || text.trim().length > 0)

  async function send(): Promise<void> {
    if (!ready || !target || sending) return
    setSending(true)
    const ok = await onSend(target.id, message(subject, page, browser, text.trim()))
    setSending(false)
    if (ok) onClose()
    else setFailed(true)
  }

  return (
    <div
      className="browser-composer"
      role="dialog"
      aria-label="Tell an agent"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          send()
        }
      }}
    >
      <div className="composer-head">
        {subject.kind === 'element' ? (
          <span className="composer-subject" title={subject.element.selector}>
            <CrosshairIcon size={13} />
            <code>{elementName(subject.element)}</code>
            {subject.element.component && (
              <span className="composer-component">{subject.element.component}</span>
            )}
            {subject.element.text && (
              <span className="composer-text">“{subject.element.text}”</span>
            )}
          </span>
        ) : (
          <span className="composer-subject" data-error>
            <BugIcon size={13} />
            {subject.errors.length === 1
              ? '1 error in the console'
              : `${subject.errors.length} errors in the console`}
          </span>
        )}
        <button className="icon-button small" aria-label="Put it away" onClick={onClose}>
          <CloseIcon size={13} />
        </button>
      </div>
      <textarea
        className="composer-input"
        autoFocus
        rows={2}
        value={text}
        placeholder={
          subject.kind === 'element'
            ? 'What should change here?'
            : 'Anything to add? The agent will look for the cause and fix it.'
        }
        onChange={(e) => {
          setText(e.target.value)
          setFailed(false)
        }}
      />
      <div className="composer-foot">
        {agents.length ? (
          <label className="composer-to">
            To
            <select
              value={target?.id ?? ''}
              onChange={(e) => {
                setTo(Number(e.target.value))
                setFailed(false)
              }}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                  {agent.linked ? ' · linked' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="composer-note">Open an agent on the canvas to send this to it</span>
        )}
        {subject.kind === 'element' && (
          <span className="composer-note">
            {subject.shot === undefined
              ? 'Taking a screenshot…'
              : subject.shot
                ? 'With a screenshot'
                : 'No screenshot'}
          </span>
        )}
        {failed && <span className="composer-note error">That agent isn’t running</span>}
        <button className="button small primary composer-send" disabled={!ready} onClick={send}>
          <SendIcon size={13} />
          Send
          <kbd>⌃↵</kbd>
        </button>
      </div>
    </div>
  )
}

// `button.primary`, as the element's opening tag would read.
function elementName({ tag, selector }: PickedElement): string {
  const last = selector.split(' > ').pop() ?? tag
  return last.replace(/:nth-of-type\(\d+\)$/, '')
}

// The message, as the agent reads it: a header that says what it's about, the details, then what
// the user wrote.
function message(
  subject: Subject,
  page: { url: string; title: string },
  browser: string,
  ask: string
): string {
  const where = `${browser} · ${page.url}${page.title ? ` (“${page.title}”)` : ''}`
  if (subject.kind === 'errors') {
    const errors = subject.errors.slice(-MAX_ERRORS).map(({ text, source, line }) => {
      const cut = text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}…` : text
      const at = source ? `  (${source}${line ? `:${line}` : ''})` : ''
      return `- ${cut}${at}`
    })
    return [
      `[nara · the user sends the console errors of ${where}]`,
      ...errors,
      '',
      ask || 'Find what causes these errors and fix them.'
    ].join('\n')
  }
  const { element, shot } = subject
  return [
    `[nara · the user points at an element in ${where}]`,
    `Element: ${element.selector}`,
    ...(element.component
      ? [`Component: ${element.component}${element.source ? ` (${element.source})` : ''}`]
      : element.source
        ? [`Source: ${element.source}`]
        : []),
    ...(element.text ? [`Text: “${element.text}”`] : []),
    `HTML: ${element.html}`,
    ...(shot ? [`Screenshot of it: ${shot}`] : []),
    '',
    ask
  ].join('\n')
}
