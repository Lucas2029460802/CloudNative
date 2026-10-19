import { parseISO } from "date-fns"
import i18n from "i18next"

const dateStyles = {
  weekday: { weekday: "short" },
  dayMonth: { month: "short", day: "numeric" },
  medium: { weekday: "short", month: "short", day: "numeric" },
  long: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>

/** Formats a `YYYY-MM-DD` calendar date in the interface language. */
export function formatDate(
  date: string,
  style: keyof typeof dateStyles = "medium"
) {
  return parseISO(date).toLocaleDateString(
    i18n.resolvedLanguage,
    dateStyles[style]
  )
}

/** Formats an ISO timestamp such as `createdAt`. */
export function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts: string[] = []
  if (hours > 0) parts.push(i18n.t("common.durationHours", { count: hours }))
  if (rest > 0 || hours === 0)
    parts.push(i18n.t("common.durationMinutes", { count: rest }))
  return parts.join(" ")
}
