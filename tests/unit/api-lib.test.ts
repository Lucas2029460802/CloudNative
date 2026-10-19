import { describe, expect, it } from "vitest"

import { loadConfig } from "../../apps/api/src/config"
import { toHourMinute, wallClock } from "../../apps/api/src/lib/time"

describe("wallClock", () => {
  const instant = new Date("2026-10-19T16:30:00Z")

  it("expresses an instant as local date and time in the given zone", () => {
    expect(wallClock(instant, "Asia/Shanghai")).toEqual({
      date: "2026-10-20",
      time: "00:30",
    })
    expect(wallClock(instant, "UTC")).toEqual({
      date: "2026-10-19",
      time: "16:30",
    })
  })

  it("uses a 24-hour clock at midnight", () => {
    expect(
      wallClock(new Date("2026-10-19T16:00:00Z"), "Asia/Shanghai").time
    ).toBe("00:00")
  })
})

describe("toHourMinute", () => {
  it("drops seconds from PostgreSQL time values", () => {
    expect(toHourMinute("09:30:00")).toBe("09:30")
  })
})

describe("loadConfig", () => {
  const DATABASE_URL = "postgres://user:secret@database:5432/venue_booking"

  it("applies defaults", () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      PORT: 3000,
      APP_TIME_ZONE: "Asia/Shanghai",
      DB_SEED_ON_START: true,
    })
  })

  it("parses numbers and booleans from strings", () => {
    const config = loadConfig({
      DATABASE_URL,
      PORT: "8000",
      DB_SEED_ON_START: "false",
    })

    expect(config.PORT).toBe(8000)
    expect(config.DB_SEED_ON_START).toBe(false)
  })

  it("explains every invalid variable", () => {
    expect(() =>
      loadConfig({ APP_TIME_ZONE: "Mars/Olympus", PORT: "http" })
    ).toThrow(
      /DATABASE_URL is required[\s\S]*PORT[\s\S]*APP_TIME_ZONE must be an IANA time zone/
    )
  })
})
