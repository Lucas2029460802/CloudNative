import { addDays, format, parseISO } from "date-fns"

/** Granularity of the booking schedule. The API itself accepts any HH:mm. */
export const SLOT_MINUTES = 30

export type TimeRange = { startTime: string; endTime: string }

export function toMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function fromMinutes(total: number) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0")
  const minutes = String(total % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

/** Local calendar date as `YYYY-MM-DD`. */
export function toISODate(date: Date) {
  return format(date, "yyyy-MM-dd")
}

export function todayISO() {
  return toISODate(new Date())
}

export function addDaysISO(date: string, days: number) {
  return toISODate(addDays(parseISO(date), days))
}

export function minutesSinceMidnight(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes()
}

export function durationMinutes({ startTime, endTime }: TimeRange) {
  return toMinutes(endTime) - toMinutes(startTime)
}

/** Half-open ranges: 09:00–10:00 and 10:00–11:00 do not overlap. */
export function overlaps(a: TimeRange, b: TimeRange) {
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  )
}

/** Bookable slots between opening and closing time; the last one is shorter if needed. */
export function daySlots(openTime: string, closeTime: string): TimeRange[] {
  const slots: TimeRange[] = []
  const close = toMinutes(closeTime)
  for (let start = toMinutes(openTime); start < close; start += SLOT_MINUTES) {
    slots.push({
      startTime: fromMinutes(start),
      endTime: fromMinutes(Math.min(start + SLOT_MINUTES, close)),
    })
  }
  return slots
}

/**
 * Bookable minutes left in the day. With `now`, only slots starting after it count,
 * matching what the schedule lets people pick. Confirmed bookings never overlap, so
 * their durations can simply be subtracted.
 */
export function freeMinutes(
  openTime: string,
  closeTime: string,
  bookings: TimeRange[],
  now?: number
) {
  const open = toMinutes(openTime)
  const start =
    now === undefined || now < open
      ? open
      : open + (Math.floor((now - open) / SLOT_MINUTES) + 1) * SLOT_MINUTES
  const end = toMinutes(closeTime)
  let free = Math.max(0, end - start)
  for (const booking of bookings) {
    const overlapStart = Math.max(toMinutes(booking.startTime), start)
    const overlapEnd = Math.min(toMinutes(booking.endTime), end)
    if (overlapEnd > overlapStart) free -= overlapEnd - overlapStart
  }
  return free
}
