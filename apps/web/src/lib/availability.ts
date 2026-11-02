import {
  daySlots,
  fromMinutes,
  overlaps,
  toMinutes,
  type TimeRange,
} from "./time"

/** Find a continuous opening on the venue's existing half-hour schedule. */
export function findAvailableRange(
  openTime: string,
  closeTime: string,
  bookings: TimeRange[],
  duration: number,
  now?: number,
  notBefore?: string
): TimeRange | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  const close = toMinutes(closeTime)
  const earliest = notBefore === undefined ? 0 : toMinutes(notBefore)
  for (const slot of daySlots(openTime, closeTime)) {
    const start = toMinutes(slot.startTime)
    if (start < earliest || (now !== undefined && start <= now)) continue
    if (start + duration > close) break
    const range = {
      startTime: slot.startTime,
      endTime: fromMinutes(start + duration),
    }
    if (!bookings.some((booking) => overlaps(booking, range))) return range
  }
  return null
}
