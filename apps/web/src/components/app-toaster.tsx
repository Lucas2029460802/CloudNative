import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Toaster } from "@/components/ui/toast"

export function AppToaster({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return <Toaster closeLabel={t("common.closeToast")}>{children}</Toaster>
}
