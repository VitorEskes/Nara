// The color schemes a terminal can wear, picked in the new terminal dialog or the side panel. Each
// has xterm's colors (`colors`) and the colors of the node around them: the bar, the bar while
// the terminal has the keyboard, and whether the bar's text is dark (`light`). Every ANSI color
// clears 4.5:1 against its background except black and bright black, which are meant to be dim.

// The 16 ANSI colors toned to the app's palette, shared by the dark schemes; each scheme sets its
// own black and bright black, which sit right next to its background.
const ANSI = {
  red: '#e2756a',
  green: '#8cc4a4',
  yellow: '#dcc28c',
  blue: '#8aa7d6',
  magenta: '#c49ac6',
  cyan: '#7fbdb4',
  white: '#d8d4ca',
  brightRed: '#ef8f82',
  brightGreen: '#a9d8bc',
  brightYellow: '#ecd6a4',
  brightBlue: '#a6bfe6',
  brightMagenta: '#d8b4da',
  brightCyan: '#9dd3cb',
  brightWhite: '#fbf9f3'
}

// Scrollbar thumbs in the text's color, at three strengths.
function scrollbar(rgb) {
  return {
    scrollbarSliderBackground: `rgba(${rgb}, 0.12)`,
    scrollbarSliderHoverBackground: `rgba(${rgb}, 0.2)`,
    scrollbarSliderActiveBackground: `rgba(${rgb}, 0.28)`
  }
}

export const TERMINAL_THEMES = {
  // The one terminals always had: a neutral charcoal island on the cream canvas.
  nara: {
    label: 'Charcoal',
    bar: '#28282a',
    barFocus: '#2e2e31',
    colors: {
      background: '#1f1f21',
      foreground: '#ece7db',
      cursor: '#8cc4a4',
      cursorAccent: '#1f1f21',
      selectionBackground: '#2f4a3d',
      selectionInactiveBackground: '#2e2e31',
      ...scrollbar('236, 231, 219'),
      black: '#2e2e31',
      brightBlack: '#86847f',
      ...ANSI
    }
  },
  // The deep green of the Nara forest.
  forest: {
    label: 'Forest',
    bar: '#1d2b24',
    barFocus: '#22332b',
    colors: {
      background: '#16211c',
      foreground: '#e6eadc',
      cursor: '#a9d8bc',
      cursorAccent: '#16211c',
      selectionBackground: '#2c4a3b',
      selectionInactiveBackground: '#22332b',
      ...scrollbar('230, 234, 220'),
      black: '#24362d',
      brightBlack: '#7f9488',
      ...ANSI
    }
  },
  // Sumi ink: as close to black as the palette goes.
  sumi: {
    label: 'Sumi',
    bar: '#18181a',
    barFocus: '#1e1e21',
    colors: {
      background: '#101011',
      foreground: '#e8e4da',
      cursor: '#ecd6a4',
      cursorAccent: '#101011',
      selectionBackground: '#33332f',
      selectionInactiveBackground: '#232326',
      ...scrollbar('232, 228, 218'),
      black: '#232326',
      brightBlack: '#7c7a76',
      ...ANSI
    }
  },
  // Evening blue, for a terminal that should stand apart from the rest.
  dusk: {
    label: 'Dusk',
    bar: '#222734',
    barFocus: '#282e3d',
    colors: {
      background: '#1a1e28',
      foreground: '#e2e5ec',
      cursor: '#a6bfe6',
      cursorAccent: '#1a1e28',
      selectionBackground: '#2f3b55',
      selectionInactiveBackground: '#282e3d',
      ...scrollbar('226, 229, 236'),
      black: '#2a3040',
      brightBlack: '#7e869a',
      ...ANSI
    }
  },
  // Washi paper: a light terminal, the same cream as the notes, with the colors darkened to read
  // on it.
  washi: {
    label: 'Washi',
    light: true,
    bar: '#efeadf',
    barFocus: '#e7e1d3',
    colors: {
      background: '#fbf9f3',
      foreground: '#232624',
      cursor: '#24503d',
      cursorAccent: '#fbf9f3',
      selectionBackground: '#d3e0d6',
      selectionInactiveBackground: '#e7e1d3',
      ...scrollbar('35, 38, 36'),
      black: '#232624',
      red: '#a8402e',
      green: '#2a6248',
      yellow: '#7a5a12',
      blue: '#2f5689',
      magenta: '#7a4577',
      cyan: '#1d6560',
      white: '#5a605b',
      brightBlack: '#8a8d86',
      brightRed: '#8f3524',
      brightGreen: '#24503d',
      brightYellow: '#66501f',
      brightBlue: '#26476f',
      brightMagenta: '#653a62',
      brightCyan: '#1a5550',
      brightWhite: '#232624'
    }
  }
}
