import type { Page } from "@playwright/test"
import type {
  Reservation,
  Venue,
} from "../../../packages/contracts/src/schemas"

export const mockDate = "2026-11-23"
export const mockVenue: Venue = {
  id: 1,
  name: "Campus Studio",
  location: "Library, 2F",
  capacity: 20,
  openTime: "08:00",
  closeTime: "22:00",
  status: "open",
  description: "A quiet space for group work and campus events.",
  createdAt: "2026-11-01T00:00:00Z",
}
export const mockReservation: Reservation = {
  id: 41,
  venueId: 1,
  venue: { id: 1, name: mockVenue.name, location: mockVenue.location },
  bookerName: "Mock booker",
  attendeeCount: 8,
  purpose: "Weekly project review",
  date: mockDate,
  startTime: "10:00",
  endTime: "11:00",
  status: "confirmed",
  createdAt: "2026-11-01T00:00:00Z",
  cancelledAt: null,
}

/** Deterministic HTTP fixtures exercise the real UI without a database or Docker. */
export async function installMockApi(page: Page) {
  const store = {
    venues: [
      { ...mockVenue },
      {
        ...mockVenue,
        id: 2,
        name: "Rooftop Garden",
        status: "disabled" as const,
      },
    ],
    reservations: [{ ...mockReservation }],
    listGate: null as Promise<void> | null,
    listFailure: false,
    listOffline: false,
    cancelGate: null as Promise<void> | null,
    forceConflict: false,
  }
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00+08:00"))
  await page.route(/\/api\/(venues|reservations)(?:\/|\?|$)/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const parts = url.pathname.split("/").filter(Boolean)
    const resource = parts[1]
    const id = Number(parts[2])
    const respond = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        json: status >= 400 ? { defined: true, ...(body as object) } : body,
      })
    const missing = async () =>
      respond(
        {
          code:
            resource === "venues" ? "VENUE_NOT_FOUND" : "RESERVATION_NOT_FOUND",
          status: 404,
          message: "Not found",
        },
        404
      )
    if (resource === "venues") {
      if (request.method() === "POST") {
        const venue = {
          ...mockVenue,
          ...request.postDataJSON(),
          id: store.venues.length + 1,
        }
        store.venues.push(venue)
        return respond(venue, 201)
      }
      if (!parts[2]) return respond(store.venues)
      return store.venues.find((venue) => venue.id === id)
        ? respond(store.venues.find((venue) => venue.id === id))
        : missing()
    }
    if (parts[3] === "cancel") {
      if (store.cancelGate) await store.cancelGate
      const reservation = store.reservations.find((item) => item.id === id)
      if (!reservation) return missing()
      reservation.status = "cancelled"
      reservation.cancelledAt = "2026-11-02T02:00:00Z"
      return respond(reservation)
    }
    if (request.method() === "POST") {
      const input = request.postDataJSON()
      const conflicts = store.reservations.filter(
        (item) =>
          item.status === "confirmed" &&
          item.venueId === input.venueId &&
          item.date === input.date &&
          item.startTime < input.endTime &&
          input.startTime < item.endTime
      )
      if (store.forceConflict || conflicts.length)
        return respond(
          {
            code: "RESERVATION_CONFLICT",
            status: 409,
            message: "Time conflict",
            data: {
              conflicts: conflicts.length ? conflicts : [mockReservation],
            },
          },
          409
        )
      const reservation = {
        ...mockReservation,
        ...input,
        id: Math.max(41, ...store.reservations.map((item) => item.id)) + 1,
        status: "confirmed" as const,
        cancelledAt: null,
      }
      store.reservations.push(reservation)
      return respond(reservation, 201)
    }
    if (parts[2]) {
      const reservation = store.reservations.find((item) => item.id === id)
      return reservation ? respond(reservation) : missing()
    }
    if (store.listGate) await store.listGate
    if (store.listOffline) return route.abort("connectionrefused")
    if (store.listFailure)
      return respond(
        {
          code: "INTERNAL_SERVER_ERROR",
          status: 500,
          message: "Server unavailable",
        },
        500
      )
    const query = url.searchParams
    return respond(
      store.reservations.filter(
        (item) =>
          (!query.has("venueId") ||
            item.venueId === Number(query.get("venueId"))) &&
          (!query.has("date") || item.date === query.get("date")) &&
          (!query.has("from") || item.date >= query.get("from")!) &&
          (!query.has("status") || item.status === query.get("status")) &&
          (!query.get("q") ||
            `${item.bookerName} ${item.purpose}`
              .toLowerCase()
              .includes(query.get("q")!.toLowerCase()))
      )
    )
  })
  return store
}
