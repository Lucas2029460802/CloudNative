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
import { findAvailableRange } from "@/lib/availability"
import { formatDate, formatDuration } from "@/lib/format"
import { freeMinutes, toMinutes } from "@/lib/time"
import { cn } from "@/lib/utils"

export type ScheduleState = "ready" | "loading" | "error"

/** Every venue's day on one shared hour axis, so free time can be compared at a glance. */
export function VenueBoard({
  venues,
  bookings,
  date,
  today,
  scheduleState,
  duration,
}: {
  scheduleState: ScheduleState
  duration: number
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
  const bookingsByVenue = Map.groupBy(bookings, (booking) => booking.venueId)
  const ordered = venues.toSorted(
    (a, b) => Number(a.status === "disabled") - Number(b.status === "disabled")
  )

  return (
    <div
      aria-busy={scheduleState === "loading"}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
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
            scheduleState={scheduleState}
            duration={duration}
          />
        ))}
      </ul>
      {scheduleState === "ready" && <BoardLegend />}
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
  scheduleState,
  duration,
}: {
  venue: Venue
  bookings: Reservation[]
  axis: Axis
  date: string
  today: string
  now?: number
  scheduleState: ScheduleState
  duration: number
}) {
  const { t } = useTranslation()
  const disabled = venue.status === "disabled"
  const ready = scheduleState === "ready"
  const available =
    ready && !disabled
      ? findAvailableRange(
          venue.openTime,
          venue.closeTime,
          bookings,
          duration,
          now
        )
      : null
  const free = freeMinutes(venue.openTime, venue.closeTime, bookings, now)
  const summary = !ready
    ? t(
        scheduleState === "loading"
          ? "board.scheduleLoading"
          : "board.scheduleUnknown"
      )
    : disabled
      ? t("board.notBookable")
      : now !== undefined && now >= toMinutes(venue.closeTime)
        ? t("board.dayOver")
        : free === 0
          ? t("board.fullyBooked")
          : t("board.free", { duration: formatDuration(free) })

  return (
    <li>
      <Link
        to="/venues/$venueId"
        params={{ venueId: String(venue.id) }}
        search={{
          date: date === today ? undefined : date,
          start: available?.startTime,
          end: available?.endTime,
        }}
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
          {ready ? (
            <>
              <DayTimeline
                axis={axis}
                openTime={venue.openTime}
                closeTime={venue.closeTime}
                bookings={bookings}
                disabled={disabled}
                now={now}
                label={t("board.timelineLabel", {
                  venue: venue.name,
                  date: formatDate(date, "long"),
                  hours: t("common.hours", {
                    open: venue.openTime,
                    close: venue.closeTime,
                  }),
                  bookings: t("board.bookings", { count: bookings.length }),
                })}
              />
              <TimelineAxis axis={axis} every={3} className="md:hidden" />
            </>
          ) : scheduleState === "loading" ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <div className="h-8 rounded-md border border-dashed" />
          )}
          <p
            className={cn(
              "text-sm font-medium",
              (disabled || free === 0) && "font-normal text-muted-foreground"
            )}
          >
            {summary}
          </p>
          {available && (
            <p className="text-sm font-medium">
              {t("board.nextAvailable")}:{" "}
              <span className="tabular-nums">
                {t("common.timeRange", {
                  start: available.startTime,
                  end: available.endTime,
                })}
              </span>
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}

export function BoardLegend() {
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
