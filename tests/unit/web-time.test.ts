import { describe, expect, it } from "vitest"

import {
  daySlots,
  durationMinutes,
  freeMinutes,
  fromMinutes,
  overlaps,
  toMinutes,
} from "../../apps/web/src/lib/time"

describe("time helpers", () => {
  it("converts between HH:mm and minutes", () => {
    expect(toMinutes("09:30")).toBe(570)
    expect(fromMinutes(570)).toBe("09:30")
    expect(durationMinutes({ startTime: "10:00", endTime: "11:30" })).toBe(90)
  })

  it("treats ranges as half-open", () => {
    const morning = { startTime: "09:00", endTime: "10:00" }
    expect(overlaps(morning, { startTime: "10:00", endTime: "11:00" })).toBe(
      false
    )
    expect(overlaps(morning, { startTime: "09:59", endTime: "11:00" })).toBe(
      true
    )
  })
})

describe("daySlots", () => {
  it("splits opening hours into half-hour slots", () => {
    expect(daySlots("09:00", "10:30")).toEqual([
      { startTime: "09:00", endTime: "09:30" },
      { startTime: "09:30", endTime: "10:00" },
      { startTime: "10:00", endTime: "10:30" },
    ])
  })

  it("shortens the last slot when hours do not divide evenly", () => {
    expect(daySlots("09:00", "09:45").at(-1)).toEqual({
      startTime: "09:30",
      endTime: "09:45",
    })
  })
})

describe("freeMinutes", () => {
  const bookings = [
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "13:00", endTime: "14:30" },
  ]

  it("subtracts bookings from the opening hours", () => {
    expect(freeMinutes("08:00", "18:00", bookings)).toBe(600 - 150)
  })

  it("only counts slots that start after now", () => {
    // At 12:10 the next bookable slot starts at 12:30.
    expect(freeMinutes("08:00", "18:00", bookings, toMinutes("12:10"))).toBe(
      330 - 90
    )
    expect(freeMinutes("08:00", "18:00", bookings, toMinutes("18:00"))).toBe(0)
  })
})
