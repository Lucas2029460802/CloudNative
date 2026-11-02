import { Link } from "@tanstack/react-router"
import type { Reservation, Venue } from "@venue/contracts"
import {
  ArrowRightIcon,
  Building2Icon,
  CircleCheckIcon,
  ClockIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DayTimeline, TimelineAxis } from "@/features/venues/day-timeline"
import { BoardLegend, type ScheduleState } from "@/features/venues/venue-board"
import { VenueDisabledBadge, VenueMeta } from "@/features/venues/venue-meta"
import { useScheduleNow } from "@/hooks/use-minutes-now"
import { findAvailableRange } from "@/lib/availability"
import { formatDate, formatDuration } from "@/lib/format"
import { toMinutes } from "@/lib/time"

export function VenueCards({
  venues,
  bookings,
  date,
  today,
  scheduleState,
  duration,
}: {
  venues: Venue[]
  bookings: Reservation[]
  date: string
  today: string
  scheduleState: ScheduleState
  duration: number
}) {
  const now = useScheduleNow(date, today)
  const bookingsByVenue = Map.groupBy(bookings, (booking) => booking.venueId)
  const ordered = venues.toSorted(
    (a, b) => Number(a.status === "disabled") - Number(b.status === "disabled")
  )

  return (
    <div
      className="flex flex-col gap-5"
      aria-busy={scheduleState === "loading"}
    >
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((venue) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            bookings={bookingsByVenue.get(venue.id) ?? []}
            date={date}
            today={today}
            scheduleState={scheduleState}
            duration={duration}
            now={now}
          />
        ))}
      </ul>
      {scheduleState === "ready" && <BoardLegend />}
    </div>
  )
}

function VenueCard({
  venue,
  bookings,
  date,
  today,
  scheduleState,
  duration,
  now,
}: {
  venue: Venue
  bookings: Reservation[]
  date: string
  today: string
  scheduleState: ScheduleState
  duration: number
  now?: number
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
  const axis = {
    start: Math.floor(toMinutes(venue.openTime) / 60) * 60,
    end: Math.ceil(toMinutes(venue.closeTime) / 60) * 60,
  }
  const dateSearch = date === today ? undefined : date

  return (
    <li className="flex min-w-0">
      <article
        className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-sm"
        aria-labelledby={`venue-card-${venue.id}`}
      >
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Building2Icon aria-hidden="true" className="size-5" />
            </span>
            {disabled ? (
              <VenueDisabledBadge />
            ) : (
              <Badge variant="secondary">
                <CircleCheckIcon data-icon="inline-start" />
                {t("board.statusOpen")}
              </Badge>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3
              id={`venue-card-${venue.id}`}
              className="text-lg leading-snug font-semibold"
            >
              <Link
                to="/venues/$venueId"
                params={{ venueId: String(venue.id) }}
                search={{ date: dateSearch }}
                className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {venue.name}
              </Link>
            </h3>
            <VenueMeta venue={venue} className="flex-col gap-y-2" />
          </div>
          <div className="mt-auto flex flex-col gap-2.5 border-t pt-4">
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
                <TimelineAxis axis={axis} every={3} />
                <div className="flex min-h-12 items-start gap-2 text-sm">
                  <ClockIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  {available ? (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs text-muted-foreground">
                        {t("board.nextAvailable")}
                      </p>
                      <Link
                        to="/venues/$venueId"
                        params={{ venueId: String(venue.id) }}
                        search={{
                          date: dateSearch,
                          start: available.startTime,
                          end: available.endTime,
                        }}
                        className="rounded-sm font-semibold tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {t("common.timeRange", {
                          start: available.startTime,
                          end: available.endTime,
                        })}
                      </Link>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {disabled
                        ? t("board.notBookable")
                        : t("board.noMatchingTime", {
                            duration: formatDuration(duration),
                          })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-28 flex-col justify-center gap-3">
                {scheduleState === "loading" ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <div className="h-8 rounded-md border border-dashed" />
                )}
                <p className="text-sm text-muted-foreground">
                  {t(
                    scheduleState === "loading"
                      ? "board.scheduleLoading"
                      : "board.scheduleUnknown"
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="border-t bg-muted/30 px-5 py-4">
          <Button
            variant={available ? "default" : "outline"}
            className="w-full"
            render={
              <Link
                to="/venues/$venueId"
                params={{ venueId: String(venue.id) }}
                search={{
                  date: dateSearch,
                  start: available?.startTime,
                  end: available?.endTime,
                }}
                aria-label={`${t(available ? "board.chooseTime" : "board.viewVenue")}: ${venue.name}`}
              />
            }
            nativeButton={false}
          >
            {t(available ? "board.chooseTime" : "board.viewVenue")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </article>
    </li>
  )
}

export function VenueCardsSkeleton() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <li
          key={item}
          className="flex flex-col gap-5 rounded-xl border bg-card p-5"
        >
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
        </li>
      ))}
    </ul>
  )
}
