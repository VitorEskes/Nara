// The pet's sprite sheets, loaded from main and measured once. A Codex pet's sheet is a grid of 8
// frames by 9 animations, and an animation with fewer frames leaves the rest of its row empty:
// the frames each row really has are counted from the pixels.

// Width of the pet at each size; a sprite cell is 192x208, so the height follows.
export const PET_SIZES = {
  s: { label: 'S', px: 64 },
  m: { label: 'M', px: 88 },
  l: { label: 'L', px: 116 }
}

export const BUILT_IN_PET = 'builtin:shika'

const COLUMNS = 8
const ROWS = 9
const cache = new Map()

// { url, counts } for a pet's id, or null if its sheet can't be read. counts[row] is how many
// frames that row has.
export function petSprite(id) {
  if (!cache.has(id)) {
    const loading = window.api.pets.sprite(id).then(async (url) => {
      if (!url) return null
      try {
        return { url, counts: await countFrames(url) }
      } catch {
        return null
      }
    })
    cache.set(id, loading)
  }
  return cache.get(id)
}

// Refresh in the settings reads every sheet again.
export function forgetSprites() {
  cache.clear()
}

async function countFrames(url) {
  const image = new Image()
  image.src = url
  await image.decode()
  const canvas = new OffscreenCanvas(image.width, image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, image.width, image.height)
  const cell = { w: image.width / COLUMNS, h: image.height / ROWS }

  // A cell counts if any pixel in it, sampled every few, isn't transparent.
  function filled(col, row) {
    const step = 4
    for (let y = Math.floor(row * cell.h); y < (row + 1) * cell.h; y += step) {
      for (let x = Math.floor(col * cell.w); x < (col + 1) * cell.w; x += step) {
        if (data[(y * image.width + x) * 4 + 3] > 16) return true
      }
    }
    return false
  }

  return Array.from({ length: ROWS }, (_, row) => {
    let count = 0
    while (count < COLUMNS && filled(count, row)) count++
    return count
  })
}
