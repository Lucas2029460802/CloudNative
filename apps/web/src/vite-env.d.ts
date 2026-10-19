/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API; defaults to the same-origin `/api` path. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
