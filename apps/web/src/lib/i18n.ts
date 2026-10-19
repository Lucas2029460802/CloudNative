import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { en } from "@/locales/en"
import { zhCN } from "@/locales/zh-CN"

// A saved choice wins; otherwise the first browser language we support, mapping
// any Chinese locale (zh, zh-Hans, zh-TW…) to Simplified Chinese.
const browserLanguage = navigator.languages
  .map((tag) => tag.toLowerCase())
  .find((tag) => tag.startsWith("zh") || tag.startsWith("en"))

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language
  localStorage.setItem("language", language)
})

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng:
    localStorage.getItem("language") ??
    (browserLanguage?.startsWith("zh") ? "zh-CN" : "en"),
  supportedLngs: ["en", "zh-CN"],
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})
