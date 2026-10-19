import { afterAll, beforeEach, inject } from "vitest"

import { createApp } from "../../apps/api/src/app"
import { createDatabase } from "../../apps/api/src/db/client"
import { venues } from "../../apps/api/src/db/schema"

export const TIME_ZONE = "Asia/Shanghai"
/** Fixed clock for deterministic "in the past" checks: 2026-10-19 10:00 in Shanghai. */
const NOW = new Date("2026-10-19T02:00:00Z")
export const TODAY = "2026-10-19"
export const TOMORROW = "2026-10-20"

const fixtureVenues = {
  hall: {
    name: "Test Hall",
    location: "Building 1",
    capacity: 20,
    openTime: "08:00",
    closeTime: "22:00",
    status: "open",
  },
  studio: {
    name: "Test Studio",
    location: "Building 2",
    capacity: 5,
    openTime: "09:00",
    closeTime: "18:00",
    status: "open",
  },
  closed: {
    name: "Closed Room",
    location: "Building 3",
    capacity: 10,
    openTime: "08:00",
    closeTime: "20:00",
    status: "disabled",
  },
} as const

type FixtureName = keyof typeof fixtureVenues

/**
 * Creates an API instance backed by the shared test database. Before every test the
 * tables are emptied and the fixture venues re-inserted; `venueIds` maps fixture names
 * to their fresh ids.
 */
export function setupTestApi() {
  const db = createDatabase(inject("databaseUrl"))
  const app = createApp({ db, timeZone: TIME_ZONE, now: () => NOW })
  const venueIds = {} as Record<FixtureName, number>

  beforeEach(async () => {
    await db.$client`truncate table reservations, venues restart identity cascade`
    for (const [name, values] of Object.entries(fixtureVenues)) {
      const [row] = await db
        .insert(venues)
        .values(values)
        .returning({ id: venues.id })
      venueIds[name as FixtureName] = row!.id
    }
  })

  afterAll(() => db.$client.end())

  async function request(path: string, init?: RequestInit) {
    const response = await app.request(`/api${path}`, init)
    const text = await response.text()
    return {
      status: response.status,
      text,
      // Assertions inspect arbitrary JSON bodies.
      body: (text ? JSON.parse(text) : undefined) as any,
    }
  }

  return {
    db,
    venueIds,
    get: (path: string) => request(path),
    post: (path: string, body?: unknown) =>
      request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    request,
  }
}

export function reservationInput(
  venueId: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    venueId,
    bookerName: "Ada Lovelace",
    attendeeCount: 4,
    date: TOMORROW,
    startTime: "10:00",
    endTime: "11:00",
    purpose: "Project sync",
    ...overrides,
  }
}
