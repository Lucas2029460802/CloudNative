import type { ReservationStatus } from "@venue/contracts"
import { CheckIcon, XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationStatus
}) {
  const { t } = useTranslation()
  return status === "confirmed" ? (
    <Badge>
      <CheckIcon data-icon="inline-start" />
      {t("status.confirmed")}
    </Badge>
  ) : (
    <Badge variant="outline">
      <XIcon data-icon="inline-start" />
      {t("status.cancelled")}
    </Badge>
  )
}
