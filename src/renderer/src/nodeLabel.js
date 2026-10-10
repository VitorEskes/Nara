// What a node is called on screen. New nodes are titled "terminal 3" or "note 4", in lowercase,
// which is also how `nara peers` lists them; on screen those read capitalized. A name the user
// gave shows exactly as typed.
export function nodeLabel({ type, id, title }) {
  return !title || title === defaultTitle(type, id) ? capitalize(defaultTitle(type, id)) : title
}

export function defaultTitle(type, id) {
  return `${type} ${id}`
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
