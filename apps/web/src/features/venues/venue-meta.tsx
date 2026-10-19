import type { Venue } from "@venue/contracts"
import { BanIcon, ClockIcon, MapPinIcon, UsersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function VenueMeta({
  venue,
  className,
}: {
  venue: Venue
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground",
        className
      )}
    >
      <li className="flex min-w-0 items-center gap-1.5">
        <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{venue.location}</span>
      </li>
      <li className="flex items-center gap-1.5">
        <UsersIcon aria-hidden="true" className="size-4 shrink-0" />
        {t("common.upToPeople", { count: venue.capacity })}
      </li>
      <li className="flex items-center gap-1.5">
        <ClockIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="tabular-nums">
          {t("common.hours", { open: venue.openTime, close: venue.closeTime })}
        </span>
      </li>
    </ul>
  )
}

export function VenueDisabledBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary">
      <BanIcon data-icon="inline-start" />
      {t("status.disabled")}
    </Badge>
  )
}
