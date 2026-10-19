import { describe, expect, it } from "vitest"

import { reservations } from "../../apps/api/src/db/schema"
import { reservationInput, TODAY, TOMORROW, useTestApi } from "./helpers"

const api = useTestApi()

function book(
  overrides: Record<string, unknown> = {},
  venue = api.venueIds.hall
) {
  return api.post("/reservations", reservationInput(venue, overrides))
}

describe("POST /api/reservations", () => {
  it("creates a confirmed reservation", async () => {
    const { status, body } = await book({ bookerName: "  Ada Lovelace  " })

    expect(status).toBe(201)
    expect(body).toEqual({
      id: expect.any(Number),
      venueId: api.venueIds.hall,
      venue: {
        id: api.venueIds.hall,
        name: "Test Hall",
        location: "Building 1",
      },
      bookerName: "Ada Lovelace",
      attendeeCount: 4,
      date: TOMORROW,
      startTime: "10:00",
      endTime: "11:00",
      purpose: "Project sync",
      status: "confirmed",
      createdAt: expect.any(String),
      cancelledAt: null,
    })
  })

  it.each([
    ["the same slot", "10:00", "11:00"],
    ["an overlapping start", "10:30", "11:30"],
    ["an overlapping end", "09:30", "10:30"],
    ["a slot inside", "10:15", "10:45"],
    ["a slot around", "09:00", "12:00"],
  ])("rejects %s with 409", async (_, startTime, endTime) => {
    const existing = await book()

    const { status, body } = await book({
      startTime,
      endTime,
      bookerName: "Grace",
    })

    expect(status).toBe(409)
    expect(body).toMatchObject({
      code: "RESERVATION_CONFLICT",
      data: {
        conflicts: [
          { id: existing.body.id, startTime: "10:00", endTime: "11:00" },
        ],
      },
    })
  })

  it("allows back-to-back reservations", async () => {
    await book()

    expect((await book({ startTime: "09:00", endTime: "10:00" })).status).toBe(
      201
    )
    expect((await book({ startTime: "11:00", endTime: "12:00" })).status).toBe(
      201
    )
  })

  it("allows the same time at another venue or on another day", async () => {
    await book()

    expect((await book({}, api.venueIds.studio)).status).toBe(201)
    expect((await book({ date: "2026-10-21" })).status).toBe(201)
  })

  it("rejects reservations that start in the past", async () => {
    const yesterday = await book({ date: "2026-10-18" })
    const earlierToday = await book({
      date: TODAY,
      startTime: "09:30",
      endTime: "10:30",
    })
    const startingNow = await book({
      date: TODAY,
      startTime: "10:00",
      endTime: "11:00",
    })
    const laterToday = await book({
      date: TODAY,
      startTime: "10:30",
      endTime: "11:30",
    })

    for (const response of [yesterday, earlierToday, startingNow]) {
      expect(response.status).toBe(400)
      expect(response.body.code).toBe("RESERVATION_IN_PAST")
    }
    expect(laterToday.status).toBe(201)
  })

  it.each([
    ["before opening", "07:30", "09:00"],
    ["after closing", "21:00", "22:30"],
  ])("rejects reservations %s with 400", async (_, startTime, endTime) => {
    const { status, body } = await book({ startTime, endTime })

    expect(status).toBe(400)
    expect(body).toMatchObject({
      code: "OUTSIDE_OPENING_HOURS",
      message: "Test Hall is open from 08:00 to 22:00",
      data: { openTime: "08:00", closeTime: "22:00" },
    })
  })

  it("accepts a reservation spanning the full opening hours", async () => {
    expect((await book({ startTime: "08:00", endTime: "22:00" })).status).toBe(
      201
    )
  })

  it("rejects reservations for a disabled venue", async () => {
    const { status, body } = await book({}, api.venueIds.closed)

    expect(status).toBe(400)
    expect(body.code).toBe("VENUE_DISABLED")
  })

  it("rejects reservations for an unknown venue", async () => {
    const { status, body } = await book({}, 9999)

    expect(status).toBe(404)
    expect(body.code).toBe("VENUE_NOT_FOUND")
  })

  it("rejects more attendees than the venue capacity", async () => {
    const atCapacity = await book({ attendeeCount: 5 }, api.venueIds.studio)
    const overCapacity = await book(
      { attendeeCount: 6, startTime: "14:00", endTime: "15:00" },
      api.venueIds.studio
    )

    expect(atCapacity.status).toBe(201)
    expect(overCapacity.status).toBe(400)
    expect(overCapacity.body).toMatchObject({
      code: "CAPACITY_EXCEEDED",
      data: { capacity: 5 },
    })
  })

  it.each([
    ["end before start", { startTime: "11:00", endTime: "10:00" }, "endTime"],
    ["zero-length slot", { startTime: "10:00", endTime: "10:00" }, "endTime"],
    ["impossible date", { date: "2026-02-30" }, "date"],
    ["bad time", { startTime: "24:00" }, "startTime"],
    ["blank name", { bookerName: "  " }, "bookerName"],
    ["missing purpose", { purpose: undefined }, "purpose"],
    ["zero attendees", { attendeeCount: 0 }, "attendeeCount"],
    ["string venue id", { venueId: "1" }, "venueId"],
  ])("rejects %s with 400", async (_, overrides, field) => {
    const { status, body } = await book(overrides)

    expect(status).toBe(400)
    expect(body.code).toBe("BAD_REQUEST")
    expect(
      body.data.issues.map((issue: { path: string[] }) => issue.path)
    ).toContainEqual([field])
  })

  it("rejects malformed JSON with 400", async () => {
    const { status, body } = await api.request("/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    })

    expect(status).toBe(400)
    expect(body.code).toBe("BAD_REQUEST")
  })
})

describe("concurrent reservations", () => {
  it("accepts exactly one of many simultaneous requests for the same slot", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        book({ bookerName: `Racer ${index}` })
      )
    )
    const statuses = responses.map((response) => response.status)

    expect(statuses.filter((status) => status === 201)).toHaveLength(1)
    expect(statuses.filter((status) => status === 409)).toHaveLength(19)

    const confirmed = await api.get(
      `/reservations?venueId=${api.venueIds.hall}&status=confirmed`
    )
    expect(confirmed.body).toHaveLength(1)
  })

  it("never stores overlapping reservations for a mix of competing slots", async () => {
    const slots = [
      ["09:00", "10:00"],
      ["09:30", "10:30"],
      ["10:00", "11:00"],
      ["10:30", "11:30"],
      ["11:00", "12:00"],
      ["09:00", "12:00"],
    ]
    const responses = await Promise.all(
      slots.flatMap(([startTime, endTime]) =>
        [1, 2].map(() => book({ startTime, endTime }))
      )
    )
    expect(responses.every((r) => r.status === 201 || r.status === 409)).toBe(
      true
    )

    const { body } = await api.get(
      `/reservations?venueId=${api.venueIds.hall}&status=confirmed`
    )
    expect(body.length).toBeGreaterThan(0)
    for (const [index, a] of body.entries()) {
      for (const b of body.slice(index + 1)) {
        expect(a.startTime < b.endTime && b.startTime < a.endTime).toBe(false)
      }
    }
  })
})

async function insertRaw(values: Partial<typeof reservations.$inferInsert>) {
  await api.database.db.insert(reservations).values({
    venueId: api.venueIds.hall,
    bookerName: "Direct SQL",
    attendeeCount: 1,
    date: TOMORROW,
    startTime: "10:00",
    endTime: "11:00",
    purpose: "Bypassing the API",
    ...values,
  })
}

describe("database overlap constraint", () => {
  it("rejects overlapping confirmed rows even when the API is bypassed", async () => {
    await insertRaw({})

    const error = await insertRaw({
      startTime: "10:30",
      endTime: "11:30",
    }).catch((caught: unknown) => caught)
    expect((error as { cause?: { code?: string } }).cause?.code).toBe("23P01")
  })

  it("ignores cancelled rows", async () => {
    await insertRaw({ status: "cancelled", cancelledAt: new Date() })

    await expect(insertRaw({})).resolves.toBeUndefined()
  })
})

describe("POST /api/reservations/:id/cancel", () => {
  it("cancels a reservation logically and frees its slot", async () => {
    const created = await book()

    const cancelled = await api.post(`/reservations/${created.body.id}/cancel`)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body).toMatchObject({
      id: created.body.id,
      status: "cancelled",
      cancelledAt: expect.any(String),
    })

    const fetched = await api.get(`/reservations/${created.body.id}`)
    expect(fetched.body.status).toBe("cancelled")

    const rebooked = await book({ bookerName: "Grace Hopper" })
    expect(rebooked.status).toBe(201)
    expect(rebooked.body.id).not.toBe(created.body.id)
  })

  it("is idempotent", async () => {
    const created = await book()
    const first = await api.post(`/reservations/${created.body.id}/cancel`)
    const second = await api.post(`/reservations/${created.body.id}/cancel`)

    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
  })

  it("returns 404 for an unknown reservation", async () => {
    const { status, body } = await api.post("/reservations/9999/cancel")

    expect(status).toBe(404)
    expect(body.code).toBe("RESERVATION_NOT_FOUND")
  })
})

describe("GET /api/reservations", () => {
  it("returns reservation details by id", async () => {
    const created = await book()

    const { status, body } = await api.get(`/reservations/${created.body.id}`)

    expect(status).toBe(200)
    expect(body).toEqual(created.body)
  })

  it("returns 404 for an unknown reservation", async () => {
    const { status, body } = await api.get("/reservations/9999")

    expect(status).toBe(404)
    expect(body).toMatchObject({
      code: "RESERVATION_NOT_FOUND",
      message: "Reservation not found",
    })
  })

  it("sorts by date and time and supports filters", async () => {
    const late = await book({
      startTime: "15:00",
      endTime: "16:00",
      bookerName: "Zoe",
    })
    const early = await book({
      startTime: "08:00",
      endTime: "09:00",
      purpose: "100% focus",
    })
    const nextDay = await book({ date: "2026-10-21", bookerName: "Yuki" })
    const studio = await book({ bookerName: "Ming" }, api.venueIds.studio)
    await api.post(`/reservations/${late.body.id}/cancel`)

    const ids = async (query: string) =>
      (await api.get(`/reservations${query}`)).body.map(
        (r: { id: number }) => r.id
      )

    expect(await ids("")).toEqual([
      early.body.id,
      studio.body.id,
      late.body.id,
      nextDay.body.id,
    ])
    expect(await ids(`?venueId=${api.venueIds.studio}`)).toEqual([
      studio.body.id,
    ])
    expect(await ids(`?date=${TOMORROW}&status=confirmed`)).toEqual([
      early.body.id,
      studio.body.id,
    ])
    expect(await ids("?from=2026-10-21")).toEqual([nextDay.body.id])
    expect(await ids("?status=cancelled")).toEqual([late.body.id])
    expect(await ids("?q=yUK")).toEqual([nextDay.body.id])
    expect(await ids("?q=100%25")).toEqual([early.body.id])
    expect(await ids("?q=%25")).toEqual([early.body.id])
  })

  it("rejects invalid filters with 400", async () => {
    for (const query of ["?status=pending", "?date=2026-13-01", "?venueId=x"]) {
      const { status, body } = await api.get(`/reservations${query}`)
      expect(status).toBe(400)
      expect(body.code).toBe("BAD_REQUEST")
    }
  })
})
