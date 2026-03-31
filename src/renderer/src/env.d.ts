/// <reference types="vite/client" />

import type { LocalTranscribeApi } from '../../shared/types'

declare global {
  interface Window {
    api: LocalTranscribeApi
  }
}

export {}
