import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { en } from "@/locales/en"
import { zhCN } from "@/locales/zh-CN"

const languages = ["en", "zh-CN"] as const
type Language = (typeof languages)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    supportedLngs: languages,
    fallbackLng: "en",
    load: "currentOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
      // Map any Chinese browser locale (zh, zh-Hans, zh-TW…) to the one we support.
      convertDetectedLanguage: (language) =>
        language.toLowerCase().startsWith("zh") ? "zh-CN" : language,
    },
  })

function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language
}

syncDocumentLanguage(i18n.resolvedLanguage ?? "en")
i18n.on("languageChanged", syncDocumentLanguage)

export function currentLanguage(): Language {
  return i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en"
}
