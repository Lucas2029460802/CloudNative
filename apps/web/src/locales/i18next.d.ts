import "i18next"

import type { Translation } from "./en"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: Translation }
  }
}
