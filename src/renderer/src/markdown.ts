// A note's text is Markdown, so agents read and write it as they would any file (`nara note`).
// The editor (Note.jsx) works on blocks: one per line, each with a type and its text without the
// Markdown that makes it that type. A block is
//
//   { id, type, text, indent, checked }
//
// where type is p, h1, h2, h3, ul, ol, todo, quote, code, hr or image; `indent` is how deep a list
// item sits and `checked` whether a todo is done. A code block's text can span several lines; an
// image's text is its caption, and `url` where it is.

export type BlockType =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'todo'
  | 'quote'
  | 'code'
  | 'hr'
  | 'image'

export interface Block {
  id: number
  type: BlockType
  text: string
  indent?: number
  checked?: boolean
  lang?: string
  url?: string
}

// A piece of inline text and how it's set.
export interface Piece {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  strike?: boolean
  href?: string
}

export const BLOCK_TYPES: Record<BlockType, { label: string; hint: string }> = {
  p: { label: 'Text', hint: 'Plain text' },
  h1: { label: 'Heading 1', hint: '#' },
  h2: { label: 'Heading 2', hint: '##' },
  h3: { label: 'Heading 3', hint: '###' },
  ul: { label: 'Bulleted list', hint: '-' },
  ol: { label: 'Numbered list', hint: '1.' },
  todo: { label: 'Checklist', hint: '[]' },
  quote: { label: 'Quote', hint: '>' },
  code: { label: 'Code', hint: '```' },
  hr: { label: 'Divider', hint: '---' },
  image: { label: 'Image', hint: '![]()' }
}

export const LISTS = new Set<string>(['ul', 'ol', 'todo'])

let nextId = 1
export function block(
  type: BlockType = 'p',
  text = '',
  extra: Partial<Omit<Block, 'id' | 'type' | 'text'>> = {}
): Block {
  return { id: nextId++, type, text, indent: 0, ...extra }
}

// The blocks in a Markdown text. Blank lines only separate blocks; they aren't kept.
export function parse(markdown = ''): Block[] {
  const blocks: Block[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*```(.*)$/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      blocks.push(block('code', body.join('\n'), { lang: fence[1].trim() }))
      continue
    }
    if (!line.trim()) continue
    blocks.push(lineBlock(line))
  }
  return blocks.length ? blocks : [block()]
}

function lineBlock(line: string): Block {
  const indent = Math.min(
    4,
    Math.floor((line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length / 2)
  )
  const rest = line.trim()
  let m
  if ((m = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) return block('image', m[1], { url: m[2] })
  if ((m = rest.match(/^(#{1,3})\s+(.*)$/))) return block(`h${m[1].length}` as BlockType, m[2])
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(rest)) return block('hr')
  if ((m = rest.match(/^[-*+]\s+\[([ xX])\]\s?(.*)$/))) {
    return block('todo', m[2], { indent, checked: m[1] !== ' ' })
  }
  if ((m = rest.match(/^[-*+]\s+(.*)$/))) return block('ul', m[1], { indent })
  if ((m = rest.match(/^\d+[.)]\s+(.*)$/))) return block('ol', m[1], { indent })
  if ((m = rest.match(/^>\s?(.*)$/))) return block('quote', m[1])
  return block('p', rest)
}

// The Markdown for the blocks. Items of the same list run together; anything else gets a blank
// line around it, as Markdown wants.
export function serialize(blocks: Block[]): string {
  let out = ''
  let previous: Block | null = null
  const counters: number[] = []
  for (const b of blocks) {
    const together =
      previous &&
      ((LISTS.has(b.type) && LISTS.has(previous.type)) ||
        (b.type === 'quote' && previous.type === 'quote'))
    if (previous) out += together ? '\n' : '\n\n'
    if (b.type !== 'ol') counters.length = 0
    out += blockLine(b, counters)
    previous = b
  }
  return out
}

function blockLine(b: Block, counters: number[]): string {
  const pad = '  '.repeat(b.indent ?? 0)
  switch (b.type) {
    case 'h1':
      return `# ${b.text}`
    case 'h2':
      return `## ${b.text}`
    case 'h3':
      return `### ${b.text}`
    case 'ul':
      return `${pad}- ${b.text}`
    case 'ol': {
      const level = b.indent ?? 0
      counters.length = level + 1
      counters[level] = (counters[level] ?? 0) + 1
      return `${pad}${counters[level]}. ${b.text}`
    }
    case 'todo':
      return `${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`
    case 'quote':
      return `> ${b.text}`
    case 'code':
      return `\`\`\`${b.lang ?? ''}\n${b.text}\n\`\`\``
    case 'hr':
      return '---'
    case 'image':
      return `![${b.text.replace(/[[\]]/g, '')}](${b.url})`
    default:
      return b.text
  }
}

// The number an item of a numbered list shows: its place among the items right before it at the
// same depth.
export function listNumber(blocks: Block[], index: number): number {
  const { indent = 0 } = blocks[index]
  let n = 1
  for (let i = index - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.type !== 'ol' && !(LISTS.has(b.type) && (b.indent ?? 0) > indent)) break
    if (b.type === 'ol' && (b.indent ?? 0) === indent) n++
    if ((b.indent ?? 0) < indent) break
  }
  return n
}

// What typing at the start of a text block turns it into: "# " a heading, "- " a list, and so on.
// Returns { type, text, checked } or null.
export function shortcut(
  text: string
): { type: BlockType; text: string; checked?: boolean } | null {
  const rules: [RegExp, BlockType, boolean?][] = [
    [/^#\s(.*)$/s, 'h1'],
    [/^##\s(.*)$/s, 'h2'],
    [/^###\s(.*)$/s, 'h3'],
    [/^(?:-\s)?\[\s?\]\s(.*)$/s, 'todo'],
    [/^(?:-\s)?\[[xX]\]\s(.*)$/s, 'todo', true],
    [/^[-*+]\s(.*)$/s, 'ul'],
    [/^1[.)]\s(.*)$/s, 'ol'],
    [/^>\s(.*)$/s, 'quote'],
    [/^```(.*)$/s, 'code']
  ]
  for (const [pattern, type, checked] of rules) {
    const m = text.match(pattern)
    if (m) return { type, text: m[1], checked: Boolean(checked) }
  }
  if (/^(-{3}|\*{3})$/.test(text)) return { type: 'hr', text: '' }
  return null
}

// Inline Markdown as pieces to render: { text, bold, italic, code, strike, href }. Covers what
// notes need: **bold**, *italic* or _italic_, `code`, ~~strike~~ and [links](url).
export function inline(text = ''): Piece[] {
  const pieces: Piece[] = []
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0
    if (at > last) pieces.push({ text: text.slice(last, at) })
    const token = m[0]
    if (m[1]) pieces.push({ text: token.slice(1, -1), code: true })
    else if (m[2] || m[3]) pieces.push({ text: token.slice(2, -2), bold: true })
    else if (m[4]) pieces.push({ text: token.slice(2, -2), strike: true })
    else if (m[5] || m[6]) pieces.push({ text: token.slice(1, -1), italic: true })
    else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? []
      pieces.push({ text: label, href })
    }
    last = at + token.length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}
