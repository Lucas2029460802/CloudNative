import { describe, expect, it } from "vitest"

import { setupTestApi } from "./helpers"

const api = setupTestApi()

const newVenue = {
  name: "  Innovation Lab  ",
  location: "Science Park, 2F",
  capacity: 40,
  openTime: "09:00",
  closeTime: "21:30",
}

describe("GET /api/venues", () => {
  it("lists venues with their opening hours and status", async () => {
    const { status, body } = await api.get("/venues")

    expect(status).toBe(200)
    expect(body).toHaveLength(3)
    expect(body[0]).toEqual({
      id: api.venueIds.hall,
      name: "Test Hall",
      location: "Building 1",
      capacity: 20,
      openTime: "08:00",
      closeTime: "22:00",
      status: "open",
      description: null,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    })
    expect(body.map((venue: { status: string }) => venue.status)).toContain(
      "disabled"
    )
  })
})

describe("GET /api/venues/:id", () => {
  it("returns venue details", async () => {
    const { status, body } = await api.get(`/venues/${api.venueIds.studio}`)

    expect(status).toBe(200)
    expect(body).toMatchObject({ name: "Test Studio", capacity: 5 })
  })

  it("returns 404 for an unknown venue", async () => {
    const { status, body } = await api.get("/venues/9999")

    expect(status).toBe(404)
    expect(body).toMatchObject({
      code: "VENUE_NOT_FOUND",
      message: "Venue not found",
    })
  })

  it.each(["abc", "0", "-1", "1.5", "99999999999"])(
    "rejects the invalid id %s with 400",
    async (id) => {
      const { status, body } = await api.get(`/venues/${id}`)

      expect(status).toBe(400)
      expect(body.code).toBe("BAD_REQUEST")
      expect(body.data.issues[0].path).toEqual(["id"])
    }
  )
})

describe("POST /api/venues", () => {
  it("creates a venue with trimmed fields and defaults", async () => {
    const created = await api.post("/venues", newVenue)

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      id: expect.any(Number),
      name: "Innovation Lab",
      status: "open",
      description: null,
      closeTime: "21:30",
    })

    const fetched = await api.get(`/venues/${created.body.id}`)
    expect(fetched.status).toBe(200)
    expect(fetched.body).toEqual(created.body)
  })

  it("stores an explicit status and description", async () => {
    const { status, body } = await api.post("/venues", {
      ...newVenue,
      status: "disabled",
      description: "Renovation until December",
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({
      status: "disabled",
      description: "Renovation until December",
    })
  })

  it.each([
    ["missing name", { name: undefined }, "name"],
    ["blank location", { location: "   " }, "location"],
    ["zero capacity", { capacity: 0 }, "capacity"],
    ["fractional capacity", { capacity: 2.5 }, "capacity"],
    ["bad time format", { openTime: "9:00" }, "openTime"],
    [
      "closing before opening",
      { openTime: "18:00", closeTime: "09:00" },
      "closeTime",
    ],
    ["unknown status", { status: "maintenance" }, "status"],
  ])("rejects %s with 400", async (_, overrides, field) => {
    const { status, body } = await api.post("/venues", {
      ...newVenue,
      ...overrides,
    })

    expect(status).toBe(400)
    expect(body.code).toBe("BAD_REQUEST")
    expect(body.data.issues).toContainEqual({
      path: [field],
      message: expect.any(String),
    })
  })
})
