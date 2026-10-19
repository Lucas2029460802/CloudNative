import { expect, test } from "@playwright/test"

// The browser only ever talks to the frontend origin; these checks go through the
// same nginx reverse proxy (/api -> api service).
test.describe("API through the frontend proxy", () => {
  test("reports that the API is connected to the database", async ({
    request,
  }) => {
    const response = await request.get("/api/health")

    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ status: "ok", database: "up" })
  })

  test("serves venues as JSON", async ({ request }) => {
    const response = await request.get("/api/venues")

    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("application/json")
    const venues = (await response.json()) as { name: string }[]
    expect(venues.map((venue) => venue.name)).toContain("Aurora Lecture Hall")
  })

  test("returns clear JSON errors without stack traces", async ({
    request,
  }) => {
    const missing = await request.get("/api/reservations/2147483647")
    expect(missing.status()).toBe(404)
    expect(await missing.json()).toMatchObject({
      code: "RESERVATION_NOT_FOUND",
    })

    const invalid = await request.post("/api/reservations", {
      data: { venueId: 1, date: "2026-02-30" },
    })
    expect(invalid.status()).toBe(400)
    const body = await invalid.text()
    expect(JSON.parse(body)).toMatchObject({ code: "BAD_REQUEST" })
    expect(body).not.toMatch(/\bat\s.+\.(js|ts):\d+/)
  })

  test("serves the API reference and client-side routes", async ({
    request,
  }) => {
    const docs = await request.get("/api/docs")
    expect(docs.status()).toBe(200)
    expect(await docs.text()).toContain("<html")

    const deepLink = await request.get("/reservations/123")
    expect(deepLink.status()).toBe(200)
    expect(await deepLink.text()).toContain('<div id="root">')
  })
})
