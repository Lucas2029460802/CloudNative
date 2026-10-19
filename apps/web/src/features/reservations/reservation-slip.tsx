import { Link } from "@tanstack/react-router"
import type { Reservation } from "@venue/contracts"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CancelReservationButton } from "@/features/reservations/cancel-reservation-button"
import { formatDate, formatDuration, formatTimestamp } from "@/lib/format"
import { durationMinutes } from "@/lib/time"
import { cn } from "@/lib/utils"

function Detail({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** The confirmation "slip": what was booked, where, when and by whom. */
export function ReservationSlip({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation()
  const cancelled = reservation.status === "cancelled"

  return (
    <article
      aria-labelledby="slip-title"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-border"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 bg-board px-6 py-4 text-board-foreground">
        <h1 id="slip-title" className="font-display text-xl">
          {t("reservation.number", { id: reservation.id })}
        </h1>
        <Badge variant={cancelled ? "board" : "signal"}>
          {t(`status.${reservation.status}`)}
        </Badge>
      </header>

      <div className="flex flex-col gap-1 px-6 pt-6 pb-5">
        <p
          className={cn(
            "font-display text-5xl tabular-nums sm:text-6xl",
            cancelled && "text-muted-foreground line-through decoration-2"
          )}
        >
          {t("common.timeRange", {
            start: reservation.startTime,
            end: reservation.endTime,
          })}
        </p>
        <p className="text-lg">{formatDate(reservation.date, "long")}</p>
        <p className="text-sm text-muted-foreground">
          {formatDuration(durationMinutes(reservation))}
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-5 border-t px-6 py-6 sm:grid-cols-2">
        <Detail label={t("reservation.venue")}>
          <Link
            to="/venues/$venueId"
            params={{ venueId: String(reservation.venueId) }}
            search={{ date: reservation.date }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {reservation.venue.name}
          </Link>
          <span className="block text-sm text-muted-foreground">
            {reservation.venue.location}
          </span>
        </Detail>
        <Detail label={t("reservation.bookedBy")}>
          {reservation.bookerName}
        </Detail>
        <Detail label={t("reservation.attendees")}>
          {t("common.people", { count: reservation.attendeeCount })}
        </Detail>
        <Detail label={t("reservation.createdAt")}>
          {formatTimestamp(reservation.createdAt)}
        </Detail>
        <Detail label={t("reservation.purpose")} wide>
          <span className="whitespace-pre-wrap">{reservation.purpose}</span>
        </Detail>
        {reservation.cancelledAt && (
          <Detail label={t("reservation.cancelledAt")}>
            {formatTimestamp(reservation.cancelledAt)}
          </Detail>
        )}
      </dl>

      <footer className="flex flex-wrap gap-3 border-t bg-muted/50 px-6 py-4">
        {!cancelled && <CancelReservationButton reservation={reservation} />}
        <Button
          variant={cancelled ? "default" : "ghost"}
          render={
            <Link
              to="/venues/$venueId"
              params={{ venueId: String(reservation.venueId) }}
              search={{ date: reservation.date }}
            />
          }
          nativeButton={false}
        >
          {t("reservation.bookAnother")}
        </Button>
      </footer>
    </article>
  )
}
