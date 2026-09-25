import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // cli.js é o comando `anbu` dos terminais; sai como arquivo separado em out/main.
        input: {
          index: resolve('src/main/index.js'),
          cli: resolve('src/main/cli.js')
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
