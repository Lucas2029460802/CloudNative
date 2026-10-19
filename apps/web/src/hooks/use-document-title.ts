import { useEffect } from "react"
import { useTranslation } from "react-i18next"

/** Keeps the browser tab title in sync with the current page and language. */
export function useDocumentTitle(title?: string) {
  const { t } = useTranslation()
  const appName = t("app.name")
  useEffect(() => {
    document.title = title ? `${title} – ${appName}` : appName
  }, [title, appName])
}
