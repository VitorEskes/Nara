import type { PickedElement } from '../../shared/types'

// The element picker of browser nodes (BrowserNode.tsx), run inside the page with the webview's
// executeJavaScript: it outlines the element under the pointer, with its name and size, and a
// click picks it instead of reaching the page. Escape gives up. It resolves with the element, or
// null. The function is sent as its source, so it can't use anything from outside itself.
/* eslint-disable @typescript-eslint/no-explicit-any */
function pickElement(): Promise<unknown> {
  const w = window as any
  w.__naraPick?.cancel()
  return new Promise((resolve) => {
    const ACCENT = '#3fb27f'
    const box = document.createElement('div')
    box.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid ${ACCENT};background:${ACCENT}22;border-radius:3px;left:0;top:0;width:0;height:0;transition:all 70ms ease-out`
    const tag = document.createElement('div')
    tag.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;padding:2px 7px;border-radius:5px;font:500 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:#18181b;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px #0005'
    document.documentElement.append(box, tag)
    let current: Element | null = null

    const name = (el: Element): string =>
      el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : '') +
      [...el.classList]
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join('')

    const move = (e: PointerEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el === current || el === box || el === tag) return
      current = el
      const r = el.getBoundingClientRect()
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`
      })
      tag.textContent = `${name(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`
      tag.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 220))}px`
      tag.style.top = `${r.top > 26 ? r.top - 24 : Math.min(r.bottom + 4, innerHeight - 24)}px`
    }

    // A path a stylesheet would find it by: ids where there are, a couple of classes, and its
    // place among siblings of the same tag.
    const selector = (el: Element | null): string => {
      const parts: string[] = []
      while (el && el.nodeType === 1 && parts.length < 6) {
        if (el.id) {
          parts.unshift(`#${CSS.escape(el.id)}`)
          break
        }
        let part = el.tagName.toLowerCase()
        const classes = [...el.classList].filter((c) => !/^(is-|has-)?(hover|active|focus)/.test(c))
        if (classes.length)
          part += classes
            .slice(0, 2)
            .map((c) => `.${CSS.escape(c)}`)
            .join('')
        const parent: Element | null = el.parentElement
        if (parent) {
          const same = [...parent.children].filter((c) => c.tagName === el!.tagName)
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`
        }
        parts.unshift(part)
        el = parent
      }
      return parts.join(' > ')
    }

    // The component that rendered it, in a development build: React's fiber, Vue's instance or
    // Svelte's meta, on the element or the nearest ancestor that has one.
    const owner = (el: Element | null): { component?: string; source?: string } => {
      for (let node: any = el; node; node = node.parentElement) {
        const key = Object.keys(node).find(
          (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
        )
        if (key) {
          for (let fiber = node[key]; fiber; fiber = fiber.return) {
            const type = fiber.type
            const inner = type?.render ?? type?.type
            const found =
              typeof type === 'function'
                ? type.displayName || type.name
                : inner && (inner.displayName || inner.name)
            if (found) {
              const at = fiber._debugSource
              return {
                component: found,
                source: at ? `${at.fileName}:${at.lineNumber}` : undefined
              }
            }
          }
        }
        const vue = node.__vueParentComponent
        if (vue) return { component: vue.type?.name || vue.type?.__name, source: vue.type?.__file }
        const svelte = node.__svelte_meta?.loc
        if (svelte) return { source: `${svelte.file}:${svelte.line}` }
      }
      return {}
    }

    const describe = (el: Element): unknown => {
      const r = el.getBoundingClientRect()
      const x = Math.max(0, r.left)
      const y = Math.max(0, r.top)
      const html = el.outerHTML.replace(/\s+/g, ' ')
      const input = el as HTMLInputElement
      const text = (
        (el as HTMLElement).innerText ||
        input.value ||
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
      return {
        selector: selector(el),
        tag: el.tagName.toLowerCase(),
        text: text.length > 240 ? `${text.slice(0, 240)}…` : text,
        html: html.length > 1500 ? `${html.slice(0, 1500)}…` : html,
        rect: {
          x,
          y,
          width: Math.max(1, Math.min(r.right, innerWidth) - x),
          height: Math.max(1, Math.min(r.bottom, innerHeight) - y)
        },
        ...owner(el)
      }
    }

    const EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick']
    // Resolves once the outline is off the screen, so a screenshot taken next doesn't show it.
    const done = (value: unknown): void => {
      removeEventListener('pointermove', move, true)
      for (const type of EVENTS) removeEventListener(type, block, true)
      removeEventListener('keydown', key, true)
      box.remove()
      tag.remove()
      delete w.__naraPick
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(value)))
    }
    function block(e: Event): void {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.type !== 'click') return
      const { clientX, clientY } = e as MouseEvent
      const el = document.elementFromPoint(clientX, clientY) ?? current
      done(el ? describe(el) : null)
    }
    function key(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      done(null)
    }

    addEventListener('pointermove', move, true)
    for (const type of EVENTS) addEventListener(type, block, true)
    addEventListener('keydown', key, true)
    w.__naraPick = { cancel: () => done(null) }
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const PICK_SCRIPT = `(${pickElement.toString()})()`
export const CANCEL_PICK_SCRIPT = 'window.__naraPick && window.__naraPick.cancel()'

// What came back from the page, if it's an element.
export function asPicked(value: unknown): PickedElement | null {
  const el = value as PickedElement | null
  return el && typeof el.selector === 'string' && el.rect ? el : null
}
