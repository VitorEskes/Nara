/// <reference types="vite/client" />

import 'react'

// The CSS variables components set inline (`style={{ '--index': 2 }}`), for main.css to read.
declare module 'react' {
  interface CSSProperties {
    [variable: `--${string}`]: string | number | undefined
  }
}
