import { tz } from "@date-fns/tz"
import { format } from "date-fns"

/**
 * Current wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in `timeZone`.
 * Reservation dates and times are stored without a time zone, so "now" must be
 * expressed the same way before comparing.
 */
export function wallClock(instant: Date, timeZone: string) {
  const zone = { in: tz(timeZone) }
  return {
    date: format(instant, "yyyy-MM-dd", zone),
    time: format(instant, "HH:mm", zone),
  }
}

/** PostgreSQL returns `time` columns as `HH:mm:ss`; the API speaks `HH:mm`. */
export function toHourMinute(time: string) {
  return time.slice(0, 5)
}
