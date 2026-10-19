import { Link } from "@tanstack/react-router"
import type { Reservation, Venue } from "@venue/contracts"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import {
  DayTimeline,
  TimelineAxis,
  type Axis,
} from "@/features/venues/day-timeline"
import { VenueDisabledBadge, VenueMeta } from "@/features/venues/venue-meta"
import { useScheduleNow } from "@/hooks/use-minutes-now"
import { formatDate, formatDuration } from "@/lib/format"
import { freeMinutes, toMinutes } from "@/lib/time"
import { cn } from "@/lib/utils"

/** Every venue's day on one shared hour axis, so free time can be compared at a glance. */
export function VenueBoard({
  venues,
  bookings,
  date,
  today,
  loading = false,
}: {
  /** True while the previous day's bookings are shown as a placeholder. */
  loading?: boolean
  venues: Venue[]
  bookings: Reservation[]
  date: string
  today: string
}) {
  const now = useScheduleNow(date, today)
  const axis: Axis = {
    start:
      Math.floor(
        Math.min(...venues.map((venue) => toMinutes(venue.openTime))) / 60
      ) * 60,
    end:
      Math.ceil(
        Math.max(...venues.map((venue) => toMinutes(venue.closeTime))) / 60
      ) * 60,
  }
  const bookingsByVenue = new Map<number, Reservation[]>()
  for (const booking of bookings) {
    bookingsByVenue.set(booking.venueId, [
      ...(bookingsByVenue.get(booking.venueId) ?? []),
      booking,
    ])
  }
  const ordered = venues.toSorted(
    (a, b) => Number(a.status === "disabled") - Number(b.status === "disabled")
  )

  return (
    <div
      aria-busy={loading}
      className={cn(
        "flex flex-col gap-3 transition-opacity",
        loading && "opacity-50"
      )}
    >
      <div className="hidden gap-6 px-3 md:grid md:grid-cols-[17rem_1fr]">
        <span />
        <TimelineAxis axis={axis} />
      </div>
      <ul className="divide-y border-y">
        {ordered.map((venue) => (
          <VenueRow
            key={venue.id}
            venue={venue}
            bookings={bookingsByVenue.get(venue.id) ?? []}
            axis={axis}
            date={date}
            today={today}
            now={now}
          />
        ))}
      </ul>
      <BoardLegend />
    </div>
  )
}

function VenueRow({
  venue,
  bookings,
  axis,
  date,
  today,
  now,
}: {
  venue: Venue
  bookings: Reservation[]
  axis: Axis
  date: string
  today: string
  now?: number
}) {
  const { t, i18n } = useTranslation()
  const disabled = venue.status === "disabled"
  const free = freeMinutes(venue.openTime, venue.closeTime, bookings, now)
  const summary = disabled
    ? t("board.notBookable")
    : now !== undefined && now >= toMinutes(venue.closeTime)
      ? t("board.dayOver")
      : free === 0
        ? t("board.fullyBooked")
        : t("board.free", { duration: formatDuration(free, t) })

  return (
    <li>
      <Link
        to="/venues/$venueId"
        params={{ venueId: String(venue.id) }}
        search={{ date: date === today ? undefined : date }}
        className="group -mx-3 grid gap-3 rounded-lg px-3 py-4 transition-colors outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 md:grid-cols-[17rem_1fr] md:items-center md:gap-6"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-display text-xl underline-offset-4 group-hover:underline">
              {venue.name}
            </h2>
            {disabled && <VenueDisabledBadge />}
          </div>
          <VenueMeta venue={venue} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <DayTimeline
            axis={axis}
            openTime={venue.openTime}
            closeTime={venue.closeTime}
            bookings={bookings}
            disabled={disabled}
            now={now}
            label={t("board.timelineLabel", {
              venue: venue.name,
              date: formatDate(date, i18n.resolvedLanguage ?? "en", "long"),
              hours: t("common.hours", {
                open: venue.openTime,
                close: venue.closeTime,
              }),
              bookings: t("board.bookings", { count: bookings.length }),
            })}
          />
          <TimelineAxis axis={axis} every={3} className="md:hidden" />
          <p
            className={cn(
              "text-sm font-medium",
              (disabled || free === 0) && "font-normal text-muted-foreground"
            )}
          >
            {summary}
          </p>
        </div>
      </Link>
    </li>
  )
}

function BoardLegend() {
  const { t } = useTranslation()
  const swatch = "h-3 w-5 shrink-0 rounded-[3px]"
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <span className={cn(swatch, "bg-card ring-1 ring-border")} />
        {t("board.legendFree")}
      </li>
      <li className="flex items-center gap-2">
        <span className={cn(swatch, "bg-slot-booked")} />
        {t("board.legendBooked")}
      </li>
      <li className="flex items-center gap-2">
        <span className={cn(swatch, "bg-hatch ring-1 ring-border")} />
        {t("board.legendClosed")}
      </li>
    </ul>
  )
}

export function VenueBoardSkeleton() {
  return (
    <ul className="min-h-[60svh] divide-y border-y" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <li
          key={row}
          className="grid gap-3 py-4 md:grid-cols-[17rem_1fr] md:items-center md:gap-6"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-8 w-full" />
        </li>
      ))}
    </ul>
  )
}
