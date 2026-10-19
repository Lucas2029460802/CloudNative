import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest"

import { createApp } from "../../apps/api/src/app"
import { createDatabase } from "../../apps/api/src/db/client"
import { TIME_ZONE, setupTestApi } from "./helpers"

const api = setupTestApi()

describe("infrastructure endpoints", () => {
  it("reports database connectivity on /api/health", async () => {
    const { status, body } = await api.get("/health")

    expect(status).toBe(200)
    expect(body).toEqual({ status: "ok", database: "up" })
  })

  it("serves the OpenAPI document", async () => {
    const { status, body } = await api.get("/openapi.json")

    expect(status).toBe(200)
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        "/venues",
        "/venues/{id}",
        "/reservations",
        "/reservations/{id}",
        "/reservations/{id}/cancel",
      ])
    )
  })

  it("returns a JSON 404 for unknown routes and methods", async () => {
    const unknown = await api.get("/does-not-exist")
    const wrongMethod = await api.request("/reservations/1", {
      method: "DELETE",
    })

    for (const response of [unknown, wrongMethod]) {
      expect(response.status).toBe(404)
      expect(response.body.code).toBe("NOT_FOUND")
    }
  })
})

describe("when the database is unavailable", () => {
  const broken = createDatabase(inject("databaseUrl"))
  const app = createApp({ db: broken, timeZone: TIME_ZONE })
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  beforeAll(() => broken.$client.end())
  afterAll(() => consoleError.mockRestore())

  it("reports 503 on the health check", async () => {
    const response = await app.request("/api/health")

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: "unavailable",
      database: "down",
    })
  })

  it("hides internal error details from clients but logs them", async () => {
    const response = await app.request("/api/venues")
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text)).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    })
    expect(text).not.toMatch(/stack|at .*\.ts|CONNECTION_ENDED/i)
    expect(consoleError).toHaveBeenCalled()
  })
})
