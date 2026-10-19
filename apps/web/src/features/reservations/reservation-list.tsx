import { Link } from "@tanstack/react-router"
import type { Reservation } from "@venue/contracts"
import { CalendarXIcon, CheckIcon, XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CancelReservationButton } from "@/features/reservations/cancel-reservation-button"
import { formatDate, formatDuration } from "@/lib/format"
import { durationMinutes } from "@/lib/time"
import { cn } from "@/lib/utils"

export function ReservationList({
  reservations,
}: {
  reservations: Reservation[]
}) {
  const { t } = useTranslation()

  if (reservations.length === 0) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarXIcon />
          </EmptyMedia>
          <EmptyTitle>{t("reservations.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("reservations.emptyBody")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link to="/" />} nativeButton={false}>
            {t("reservations.emptyAction")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  // The API returns reservations sorted by date and time, so days stay in order.
  const days = Map.groupBy(reservations, (reservation) => reservation.date)

  return (
    <div className="flex flex-col gap-8">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t("reservations.count", { count: reservations.length })}
      </p>
      {[...days].map(([date, items]) => (
        <section
          key={date}
          aria-labelledby={`day-${date}`}
          className="flex flex-col gap-3"
        >
          <h2 id={`day-${date}`} className="font-display text-xl">
            {formatDate(date, "long")}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {items.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ReservationRow({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation()
  const cancelled = reservation.status === "cancelled"
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="shrink-0 sm:w-36">
        <p
          className={cn(
            "font-display text-2xl tabular-nums",
            cancelled && "text-muted-foreground line-through"
          )}
        >
          {t("common.timeRange", {
            start: reservation.startTime,
            end: reservation.endTime,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDuration(durationMinutes(reservation))}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/venues/$venueId"
            params={{ venueId: String(reservation.venueId) }}
            search={{ date: reservation.date }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {reservation.venue.name}
          </Link>
          <Badge variant={cancelled ? "outline" : "default"}>
            {cancelled ? (
              <XIcon data-icon="inline-start" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            {t(`status.${reservation.status}`)}
          </Badge>
        </div>
        <p className="text-sm">
          {reservation.bookerName}
          <span className="text-muted-foreground">
            {" "}
            ({t("common.people", { count: reservation.attendeeCount })})
          </span>
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {reservation.purpose}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              to="/reservations/$reservationId"
              params={{ reservationId: String(reservation.id) }}
              aria-label={`${t("reservations.view")}: ${t("reservation.number", { id: reservation.id })}`}
            />
          }
          nativeButton={false}
        >
          {t("reservations.view")}
        </Button>
        {!cancelled && (
          <CancelReservationButton reservation={reservation} size="sm" />
        )}
      </div>
    </li>
  )
}

export function ReservationListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-6 w-56" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-24 w-full" />
      ))}
    </div>
  )
}
