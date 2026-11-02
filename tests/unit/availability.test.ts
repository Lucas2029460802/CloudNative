import { describe, expect, it } from "vitest"

import { findAvailableRange } from "../../apps/web/src/lib/availability"
import { toMinutes } from "../../apps/web/src/lib/time"
import {
  boardSearchSchema,
  bookingSearchSchema,
  reservationSearchSchema,
} from "../../apps/web/src/lib/search"

describe("continuous availability", () => {
  it("finds a continuous range rather than adding fragmented free time", () => {
    const bookings = [
      { startTime: "09:30", endTime: "10:00" },
      { startTime: "10:30", endTime: "11:00" },
    ]
    expect(findAvailableRange("09:00", "12:00", bookings, 60)).toEqual({
      startTime: "11:00",
      endTime: "12:00",
    })
    expect(findAvailableRange("09:00", "11:00", bookings, 60)).toBeNull()
  })

  it("respects exact adjacency, the closing time and arbitrary API booking times", () => {
    expect(
      findAvailableRange(
        "09:00",
        "11:00",
        [{ startTime: "09:15", endTime: "10:00" }],
        60
      )
    ).toEqual({ startTime: "10:00", endTime: "11:00" })
    expect(findAvailableRange("09:00", "09:45", [], 60)).toBeNull()
    expect(findAvailableRange("09:00", "09:45", [], 30)).toEqual({
      startTime: "09:00",
      endTime: "09:30",
    })
  })

  it("only offers slots strictly after now and at or after a requested starting point", () => {
    expect(
      findAvailableRange("08:00", "18:00", [], 60, toMinutes("12:00"))
    ).toEqual({ startTime: "12:30", endTime: "13:30" })
    expect(
      findAvailableRange("08:00", "18:00", [], 60, undefined, "13:15")
    ).toEqual({ startTime: "13:30", endTime: "14:30" })
    expect(
      findAvailableRange("08:00", "18:00", [], 60, toMinutes("18:00"))
    ).toBeNull()
    expect(findAvailableRange("08:00", "18:00", [], 0)).toBeNull()
  })
})

describe("URL search validation", () => {
  it("accepts shared links and strips invalid filter values", () => {
    expect(
      boardSearchSchema.parse({
        date: "2026-11-20",
        duration: "120",
        people: "12",
        view: "timeline",
      })
    ).toEqual({
      date: "2026-11-20",
      duration: 120,
      people: 12,
      view: "timeline",
    })
    expect(
      boardSearchSchema.parse({
        date: "2026-02-30",
        duration: 45,
        people: -2,
        view: "unknown",
      })
    ).toEqual({
      date: undefined,
      duration: undefined,
      people: undefined,
      view: undefined,
    })
    expect(bookingSearchSchema.parse({ start: "09:00", end: "25:00" })).toEqual(
      { start: "09:00", end: undefined }
    )
    expect(
      reservationSearchSchema.parse({
        date: "2026-11-20",
        venueId: "3",
        status: "cancelled",
        unknown: "ignored",
      })
    ).toEqual({ date: "2026-11-20", venueId: 3, status: "cancelled" })
  })
})
