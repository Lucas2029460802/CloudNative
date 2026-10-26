import type { Reservation } from "@venue/contracts"
import { useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  daySlots,
  overlaps,
  SLOT_MINUTES,
  toMinutes,
  type TimeRange,
} from "@/lib/time"

type SlotState = "free" | "booked" | "past"

/**
 * A venue's opening hours as a column of half-hour slots. The first click picks the
 * start slot, the second click the end slot. Confirmed bookings and past slots
 * cannot be clicked, but the API remains the authority on conflicts.
 */
export function SlotPicker({
  openTime,
  closeTime,
  bookings,
  value,
  onChange,
  now,
}: {
  openTime: string
  closeTime: string
  bookings: Reservation[]
  value: TimeRange | null
  onChange: (range: TimeRange) => void
  /** Minutes since midnight when the day is today (or later than closing for past days). */
  now?: number
}) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<TimeRange | null>(null)
  const slots = daySlots(openTime, closeTime)
  const open = toMinutes(openTime)
  // The anchor only counts while the selection is still the single slot it created.
  const pending =
    anchor &&
    value?.startTime === anchor.startTime &&
    value.endTime === anchor.endTime
      ? anchor
      : null
  const conflict =
    value !== null && bookings.some((booking) => overlaps(booking, value))

  const box = (from: number, to: number): CSSProperties => ({
    top: `calc(var(--slot-h) * ${(from - open) / SLOT_MINUTES} + 2px)`,
    height: `calc(var(--slot-h) * ${(to - from) / SLOT_MINUTES} - 4px)`,
  })

  function stateOf(slot: TimeRange): SlotState {
    if (bookings.some((booking) => overlaps(booking, slot))) return "booked"
    if (now !== undefined && toMinutes(slot.startTime) <= now) return "past"
    return "free"
  }

  function pick(slot: TimeRange) {
    if (!pending) {
      setAnchor(slot)
      onChange(slot)
      return
    }
    setAnchor(null)
    onChange(
      toMinutes(slot.startTime) >= toMinutes(pending.startTime)
        ? { startTime: pending.startTime, endTime: slot.endTime }
        : { startTime: slot.startTime, endTime: pending.endTime }
    )
  }

  const stateLabel = {
    free: t("venue.slotFree"),
    booked: t("venue.slotBooked"),
    past: t("venue.slotPast"),
  }

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {pending ? t("venue.chooseEndHint") : t("venue.chooseTimeHint")}
      </p>
      <div className="flex [--slot-h:2rem]">
        <ol aria-hidden="true" className="relative w-12 shrink-0">
          {slots
            .filter((slot) => slot.startTime.endsWith(":00"))
            .map((slot) => (
              <li
                key={slot.startTime}
                className="absolute right-2.5 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{
                  top: `calc(var(--slot-h) * ${(toMinutes(slot.startTime) - open) / SLOT_MINUTES})`,
                }}
              >
                {slot.startTime}
              </li>
            ))}
        </ol>
        <div className="relative min-w-0 flex-1">
          <ul className="overflow-hidden rounded-lg border bg-card">
            {slots.map((slot) => {
              const state = stateOf(slot)
              const selected = value !== null && overlaps(slot, value)
              return (
                <li
                  key={slot.startTime}
                  className="h-(--slot-h) border-t first:border-t-0 [&:nth-child(even)]:border-dashed"
                >
                  <button
                    type="button"
                    disabled={state !== "free"}
                    aria-pressed={selected}
                    aria-label={t("venue.slotLabel", {
                      start: slot.startTime,
                      end: slot.endTime,
                      state: selected
                        ? t("venue.slotSelected")
                        : stateLabel[state],
                    })}
                    onClick={() => pick(slot)}
                    className={cn(
                      "block size-full transition-colors outline-none focus-visible:relative focus-visible:z-30 focus-visible:ring-3 focus-visible:ring-ring/60",
                      state === "free" && "cursor-pointer hover:bg-muted",
                      state === "past" &&
                        "cursor-not-allowed bg-muted text-muted-foreground bg-hatch"
                    )}
                  />
                </li>
              )
            })}
          </ul>
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="pointer-events-none absolute inset-x-1 z-10 flex items-start gap-2 overflow-hidden rounded-md bg-slot-booked px-2 py-1 text-xs leading-5 text-slot-booked-foreground"
              style={box(
                toMinutes(booking.startTime),
                toMinutes(booking.endTime)
              )}
            >
              <span className="shrink-0 font-semibold tabular-nums">
                {t("common.timeRange", {
                  start: booking.startTime,
                  end: booking.endTime,
                })}
              </span>
              <span className="truncate opacity-85">{booking.bookerName}</span>
            </div>
          ))}
          {value && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-1 z-20 flex items-start gap-2 overflow-hidden rounded-md px-2 py-1 text-xs leading-5 font-semibold ring-2 transition-[top,height] duration-150",
                conflict
                  ? "bg-destructive/15 text-destructive ring-destructive"
                  : "bg-signal text-signal-foreground ring-signal-foreground/20"
              )}
              style={box(toMinutes(value.startTime), toMinutes(value.endTime))}
            >
              <span className="tabular-nums">
                {t("common.timeRange", {
                  start: value.startTime,
                  end: value.endTime,
                })}
              </span>
              <span className="truncate font-normal">
                {t("venue.yourSelection")}
              </span>
            </div>
          )}
          {now !== undefined && now > open && now < toMinutes(closeTime) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-destructive"
              style={{
                top: `calc(var(--slot-h) * ${(now - open) / SLOT_MINUTES})`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
