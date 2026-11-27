/* oxlint-disable no-underscore-dangle -- the Slidev CLI picks these names */
import type { SlideInfo } from "@slidev/types"

// vue-tsc also checks the Slidev client, which ships as TypeScript source.
// The Slidev CLI defines these flags and sends these events (getDefine() and
// the slidev:update-* hot events in @slidev/cli), but ships no types for them.
declare global {
  const __DEV__: boolean
  const __SLIDEV_CLIENT_ROOT__: string
  const __SLIDEV_HASH_ROUTE__: boolean
  const __SLIDEV_MEMORY_ROUTE__: boolean
  const __SLIDEV_FEATURE_DRAWINGS__: boolean
  const __SLIDEV_FEATURE_EDITOR__: boolean
  const __SLIDEV_FEATURE_DRAWINGS_PERSIST__: boolean
  const __SLIDEV_FEATURE_RECORD__: boolean
  const __SLIDEV_FEATURE_PRESENTER__: boolean
  const __SLIDEV_FEATURE_PRINT__: boolean
  const __SLIDEV_FEATURE_BROWSER_EXPORTER__: boolean
  const __SLIDEV_FEATURE_WAKE_LOCK__: boolean
  const __SLIDEV_FEATURE_PWA__: boolean
  const __SLIDEV_HAS_SERVER__: boolean
}

declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    "slidev:update-slide": {
      no: number
      data: SlideInfo
    }
    "slidev:update-note": { no: number; note: string; noteHTML: string }
  }
}
