import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

// Monaco, set up once for the code view: its workers, TypeScript that reads JSX, and a theme made
// from Nara's own colors that follows the app between light and dark.

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

// The editor only sees the files that are open, not the project's node_modules or tsconfig, so
// type errors would flag every import. It checks syntax and leaves the types to the agents and the
// project's own tooling.
for (const defaults of [
  monaco.typescript.typescriptDefaults,
  monaco.typescript.javascriptDefaults
]) {
  defaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true
  })
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
}

// Monaco's theme takes hex colors; Nara's are CSS variables, some see-through. A probe element
// turns each into the rgb() the browser computed, and that into hex.
function cssColor(name) {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.body.append(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number)
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a * 255) : ''}`
}

function defineTheme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const c = (name) => cssColor(name)
  const colors = {
    'editor.background': c('--bg'),
    'editor.foreground': c('--text'),
    'editorLineNumber.foreground': c('--text-4'),
    'editorLineNumber.activeForeground': c('--text-2'),
    'editor.lineHighlightBackground': c('--hover-soft'),
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': c('--selection'),
    'editor.inactiveSelectionBackground': c('--active-soft'),
    'editorCursor.foreground': c('--accent'),
    'editorIndentGuide.background1': c('--edge'),
    'editorIndentGuide.activeBackground1': c('--edge-focus'),
    'editorWhitespace.foreground': c('--edge-strong'),
    'editorWidget.background': c('--stone'),
    'editorWidget.border': c('--edge-strong'),
    'editorSuggestWidget.background': c('--stone'),
    'editorSuggestWidget.border': c('--edge-strong'),
    'editorSuggestWidget.selectedBackground': c('--raised'),
    'editorHoverWidget.background': c('--stone'),
    'editorHoverWidget.border': c('--edge-strong'),
    'input.background': c('--raised'),
    'input.border': c('--edge-strong'),
    focusBorder: c('--edge-focus'),
    'scrollbarSlider.background': c('--active-soft'),
    'scrollbarSlider.hoverBackground': c('--edge-strong'),
    'scrollbarSlider.activeBackground': c('--edge-focus'),
    'editorGutter.background': c('--bg'),
    'minimap.background': c('--bg'),
    'diffEditor.insertedTextBackground': c('--accent-soft'),
    'diffEditor.removedTextBackground': c('--danger-soft')
  }
  monaco.editor.defineTheme('nara', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors
  })
  monaco.editor.setTheme('nara')
}

let themed = false
// Called before the first editor is made; from then on the theme follows the app's.
export function setUpTheme() {
  if (themed) return
  themed = true
  defineTheme()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', defineTheme)
  // Geist Mono may still be loading; Monaco measures the font once, so it measures again.
  document.fonts.ready.then(() => monaco.editor.remeasureFonts())
}

// The language Monaco picks for a file by its name, for the status bar.
export function languageName(model) {
  const id = model.getLanguageId()
  const language = monaco.languages.getLanguages().find((l) => l.id === id)
  return language?.aliases?.[0] ?? id
}

export { monaco }
