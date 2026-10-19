import { parseISO } from "date-fns"
import type { TFunction } from "i18next"

const dateStyles = {
  weekday: { weekday: "short" },
  dayMonth: { month: "short", day: "numeric" },
  medium: { weekday: "short", month: "short", day: "numeric" },
  long: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(language: string, options: Intl.DateTimeFormatOptions) {
  const key = `${language}|${JSON.stringify(options)}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(language, options)
    formatters.set(key, cached)
  }
  return cached
}

/** Formats a `YYYY-MM-DD` calendar date in the interface language. */
export function formatDate(
  date: string,
  language: string,
  style: keyof typeof dateStyles = "medium"
) {
  return formatter(language, dateStyles[style]).format(parseISO(date))
}

/** Formats an ISO timestamp such as `createdAt`. */
export function formatTimestamp(timestamp: string, language: string) {
  return formatter(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

export function formatDuration(minutes: number, t: TFunction) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts: string[] = []
  if (hours > 0) parts.push(t("common.durationHours", { count: hours }))
  if (rest > 0 || hours === 0)
    parts.push(t("common.durationMinutes", { count: rest }))
  return parts.join(" ")
}
