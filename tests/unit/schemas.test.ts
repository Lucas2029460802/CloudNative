import { describe, expect, it } from "vitest"

import {
  CalendarDateSchema,
  CreateReservationInputSchema,
  CreateVenueInputSchema,
  IdSchema,
  TimeOfDaySchema,
} from "../../packages/contracts/src/schemas"

describe("TimeOfDaySchema", () => {
  it.each(["00:00", "09:30", "23:59"])("accepts %s", (value) => {
    expect(TimeOfDaySchema.safeParse(value).success).toBe(true)
  })

  it.each(["9:30", "24:00", "12:60", "12:00:00", "noon", ""])(
    "rejects %s",
    (value) => {
      expect(TimeOfDaySchema.safeParse(value).success).toBe(false)
    }
  )
})

describe("CalendarDateSchema", () => {
  it.each(["2026-10-19", "2028-02-29"])("accepts %s", (value) => {
    expect(CalendarDateSchema.safeParse(value).success).toBe(true)
  })

  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-5", "19/10/2026"])(
    "rejects %s",
    (value) => {
      expect(CalendarDateSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe("IdSchema", () => {
  it("coerces numeric strings from paths and query strings", () => {
    expect(IdSchema.parse("42")).toBe(42)
  })

  it.each(["0", "-3", "1.5", "abc", "2147483648"])("rejects %s", (value) => {
    expect(IdSchema.safeParse(value).success).toBe(false)
  })
})

const reservation = {
  venueId: 1,
  bookerName: "  Robotics Club ",
  attendeeCount: 12,
  date: "2026-10-20",
  startTime: "14:00",
  endTime: "16:30",
  purpose: " Weekly build session ",
}

describe("CreateReservationInputSchema", () => {
  it("trims text fields", () => {
    expect(CreateReservationInputSchema.parse(reservation)).toMatchObject({
      bookerName: "Robotics Club",
      purpose: "Weekly build session",
    })
  })

  it("requires the end time to be after the start time", () => {
    const result = CreateReservationInputSchema.safeParse({
      ...reservation,
      endTime: "14:00",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["endTime"])
  })

  it("limits field lengths", () => {
    const result = CreateReservationInputSchema.safeParse({
      ...reservation,
      bookerName: "x".repeat(101),
      purpose: "y".repeat(501),
    })

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "bookerName",
      "purpose",
    ])
  })
})

describe("CreateVenueInputSchema", () => {
  const venue = {
    name: "Studio",
    location: "Arts Center",
    capacity: 30,
    openTime: "08:00",
    closeTime: "20:00",
  }

  it("defaults the status to open", () => {
    expect(CreateVenueInputSchema.parse(venue).status).toBe("open")
  })

  it("requires closing time after opening time", () => {
    const result = CreateVenueInputSchema.safeParse({
      ...venue,
      closeTime: "08:00",
    })

    expect(result.error?.issues[0]?.path).toEqual(["closeTime"])
  })
})
