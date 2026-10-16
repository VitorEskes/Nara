import '@fontsource/open-runde/400.css'
import '@fontsource/open-runde/500.css'
import '@fontsource/open-runde/600.css'
import '@fontsource/open-runde/700.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/700.css'
// Only the Latin subset: the full Japanese font is tens of megabytes, and the serif is only used
// for notes set in serif.
import '@fontsource/shippori-mincho-b1/latin-500.css'
import '@fontsource/shippori-mincho-b1/latin-800.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Hud from './components/Hud'
import Pet from './components/Pet'

// The floating HUD's window loads this same page with #hud (main/hud.ts) and the desktop pet's
// with #pet (main/petProcess.ts): each shows alone, on a transparent page.
const hud = location.hash === '#hud'
const pet = location.hash === '#pet'
if (hud || pet) document.documentElement.classList.add('hud')

// xterm measures the width of a character once, when a terminal opens. If the monospace font
// arrived after that, every terminal would lay out its text with the fallback font's width.
// Browsers only fetch a font when something uses it, so these load it on purpose first.
const fonts = ['400 13px "Geist Mono"', '700 13px "Geist Mono"']

Promise.allSettled(fonts.map((font) => document.fonts.load(font))).then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>{hud ? <Hud /> : pet ? <Pet /> : <App />}</StrictMode>
  )
})
