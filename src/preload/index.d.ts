import type { SecurityAppApi } from '../shared/ipc'

declare global {
  interface Window {
    securityApp: SecurityAppApi
  }
}

export {}
