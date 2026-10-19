/**
 * Current wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in `timeZone`.
 * Reservation dates and times are stored without a time zone, so "now" must be
 * expressed the same way before comparing.
 */
export function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

/** PostgreSQL returns `time` columns as `HH:mm:ss`; the API speaks `HH:mm`. */
export function toHourMinute(time: string) {
  return time.slice(0, 5)
}
