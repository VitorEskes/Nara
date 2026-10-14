// What the browser node's address bar and `nara browser open` make of what was typed: an address
// as it is, "localhost:5173" or "example.com" with a scheme added, and anything else a search.
export function normalizeUrl(input) {
  const text = String(input ?? '').trim()
  if (!text) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^about:/i.test(text)) return text
  const local =
    /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(text)
  if (/\s/.test(text) || (!local && !/\.[a-z]{2,}(:\d+)?(\/|$)|^\d+\.\d+\.\d+\.\d+/i.test(text))) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
  }
  return `${local ? 'http' : 'https'}://${text}`
}
