// The timeline is a composite graphic of positioned blocks, announced to assistive
// technology as one image with a text summary (role="img" + aria-label).
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { cn } from "@/lib/utils"
import { toMinutes, type TimeRange } from "@/lib/time"

export type Axis = { start: number; end: number }

function position(axis: Axis, minutes: number) {
  return `${((minutes - axis.start) / (axis.end - axis.start)) * 100}%`
}

function span(axis: Axis, from: number, to: number) {
  return `${((to - from) / (axis.end - axis.start)) * 100}%`
}

function axisHours(axis: Axis) {
  const hours: number[] = []
  for (
    let minutes = Math.ceil(axis.start / 60) * 60;
    minutes <= axis.end;
    minutes += 60
  ) {
    hours.push(minutes)
  }
  return hours
}

/** Hour labels aligned with `DayTimeline` tracks that share the same axis. */
export function TimelineAxis({
  axis,
  every = 1,
  className,
}: {
  axis: Axis
  every?: number
  className?: string
}) {
  const hours = axisHours(axis).filter(
    (minutes) => (minutes / 60) % every === 0
  )
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-4 text-xs text-muted-foreground tabular-nums",
        className
      )}
    >
      {hours.map((minutes) => (
        <span
          key={minutes}
          className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
          style={{ left: position(axis, minutes) }}
        >
          {String(minutes / 60).padStart(2, "0")}
        </span>
      ))}
    </div>
  )
}

/**
 * One venue's day at a glance: booked time in solid board green, hatching where the
 * venue cannot be booked (outside opening hours, already past, or disabled).
 */
export function DayTimeline({
  axis,
  openTime,
  closeTime,
  bookings,
  disabled = false,
  now,
  label,
}: {
  axis: Axis
  openTime: string
  closeTime: string
  bookings: TimeRange[]
  disabled?: boolean
  /** Minutes since midnight when the shown day is today. */
  now?: number
  label: string
}) {
  const open = toMinutes(openTime)
  const close = toMinutes(closeTime)
  const pastUntil =
    now === undefined ? open : Math.min(Math.max(now, open), close)

  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-8 overflow-hidden rounded-md bg-card ring-1 ring-border"
    >
      {disabled ? (
        <div className="absolute inset-0 bg-hatch" />
      ) : (
        <>
          <div
            className="absolute inset-y-0 left-0 bg-hatch"
            style={{ width: span(axis, axis.start, open) }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-hatch"
            style={{ left: position(axis, close) }}
          />
          {pastUntil > open && (
            <div
              className="absolute inset-y-0 bg-hatch"
              style={{
                left: position(axis, open),
                width: span(axis, open, pastUntil),
              }}
            />
          )}
        </>
      )}
      {axisHours(axis).map((minutes) => (
        <div
          key={minutes}
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: position(axis, minutes) }}
        />
      ))}
      {!disabled &&
        bookings.map((booking) => (
          <div
            key={`${booking.startTime}-${booking.endTime}`}
            className="absolute inset-y-1 rounded-[3px] bg-slot-booked"
            style={{
              left: position(axis, toMinutes(booking.startTime)),
              width: span(
                axis,
                toMinutes(booking.startTime),
                toMinutes(booking.endTime)
              ),
            }}
          />
        ))}
      {now !== undefined && now > axis.start && now < axis.end && (
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-destructive"
          style={{ left: position(axis, now) }}
        />
      )}
    </div>
  )
}
