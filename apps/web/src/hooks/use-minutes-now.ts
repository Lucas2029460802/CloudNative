import { useEffect, useState } from "react"

import { minutesSinceMidnight } from "@/lib/time"

/** Minutes since local midnight, refreshed every 30 seconds so "past" shading stays current. */
function useMinutesNow() {
  const [now, setNow] = useState(minutesSinceMidnight)
  useEffect(() => {
    const timer = setInterval(() => setNow(minutesSinceMidnight()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** "Now" as seen by a schedule for `date`: undefined for future days, end of day for past ones. */
export function useScheduleNow(date: string, today: string) {
  const now = useMinutesNow()
  if (date === today) return now
  return date < today ? 24 * 60 : undefined
}
