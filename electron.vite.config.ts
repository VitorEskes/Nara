import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // cli.ts is the `nara` command run inside terminals, and whisper.ts the voice bar's
        // speech-to-text process; each is built as its own file in out/main.
        input: {
          index: resolve('src/main/index.ts'),
          cli: resolve('src/main/cli.ts'),
          whisper: resolve('src/main/whisper.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
