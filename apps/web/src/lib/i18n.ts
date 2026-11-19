import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import { en } from "@/locales/en"
import { zhCN } from "@/locales/zh-CN"

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language
})

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    supportedLngs: ["en", "zh-CN"],
    fallbackLng: "en",
    // A saved choice wins; otherwise the first browser language we support, mapping
    // any Chinese locale (zh, zh-Hans, zh-TW…) to Simplified Chinese.
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
      convertDetectedLanguage: (tag) =>
        tag.toLowerCase().startsWith("zh")
          ? "zh-CN"
          : tag.toLowerCase().startsWith("en")
            ? "en"
            : tag,
    },
    interpolation: { escapeValue: false },
  })
