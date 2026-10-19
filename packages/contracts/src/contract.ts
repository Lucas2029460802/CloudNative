import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  CreateReservationInputSchema,
  CreateVenueInputSchema,
  IdParamsSchema,
  ListReservationsQuerySchema,
  ReservationConflictSchema,
  ReservationSchema,
  TimeOfDaySchema,
  VenueSchema,
} from "./schemas"

/**
 * Business errors the API can return, keyed by the `code` field of the JSON error body.
 * Malformed or invalid input is reported separately as `BAD_REQUEST` (400) with `data.issues`.
 */
export const apiErrors = {
  VENUE_NOT_FOUND: { status: 404, message: "Venue not found" },
  RESERVATION_NOT_FOUND: { status: 404, message: "Reservation not found" },
  VENUE_DISABLED: {
    status: 400,
    message: "This venue is disabled and does not accept reservations",
  },
  OUTSIDE_OPENING_HOURS: {
    status: 400,
    message: "The reservation must be within the venue's opening hours",
    data: z.object({ openTime: TimeOfDaySchema, closeTime: TimeOfDaySchema }),
  },
  RESERVATION_IN_PAST: {
    status: 400,
    message: "The reservation must start in the future",
  },
  CAPACITY_EXCEEDED: {
    status: 400,
    message: "The number of attendees exceeds the venue capacity",
    data: z.object({ capacity: z.number().int() }),
  },
  RESERVATION_CONFLICT: {
    status: 409,
    message: "The requested time overlaps an existing reservation",
    data: z.object({ conflicts: z.array(ReservationConflictSchema) }),
  },
} as const

export type ApiErrorCode = keyof typeof apiErrors

const { VENUE_NOT_FOUND, RESERVATION_NOT_FOUND } = apiErrors

/** REST contract shared by the API (implementation) and the web app (typed client). */
export const contract = {
  venues: {
    list: oc
      .route({
        method: "GET",
        path: "/venues",
        summary: "List venues",
        tags: ["Venues"],
      })
      .output(z.array(VenueSchema)),
    get: oc
      .route({
        method: "GET",
        path: "/venues/{id}",
        summary: "Get venue details",
        tags: ["Venues"],
      })
      .errors({ VENUE_NOT_FOUND })
      .input(IdParamsSchema)
      .output(VenueSchema),
    create: oc
      .route({
        method: "POST",
        path: "/venues",
        successStatus: 201,
        summary: "Create a venue",
        tags: ["Venues"],
      })
      .input(CreateVenueInputSchema)
      .output(VenueSchema),
  },
  reservations: {
    list: oc
      .route({
        method: "GET",
        path: "/reservations",
        summary: "List reservations",
        description:
          "Sorted by date and start time. All filters are optional and combined with AND.",
        tags: ["Reservations"],
      })
      .input(ListReservationsQuerySchema)
      .output(z.array(ReservationSchema)),
    get: oc
      .route({
        method: "GET",
        path: "/reservations/{id}",
        summary: "Get reservation details",
        tags: ["Reservations"],
      })
      .errors({ RESERVATION_NOT_FOUND })
      .input(IdParamsSchema)
      .output(ReservationSchema),
    create: oc
      .route({
        method: "POST",
        path: "/reservations",
        successStatus: 201,
        summary: "Create a reservation",
        description:
          "Rejects reservations for missing or disabled venues, outside opening hours, in the past, over capacity, or overlapping a confirmed reservation of the same venue.",
        tags: ["Reservations"],
      })
      .errors(apiErrors)
      .input(CreateReservationInputSchema)
      .output(ReservationSchema),
    cancel: oc
      .route({
        method: "POST",
        path: "/reservations/{id}/cancel",
        summary: "Cancel a reservation",
        description:
          "Logical cancellation: the record is kept with status `cancelled` and its time slot becomes bookable again. Cancelling twice is a no-op.",
        tags: ["Reservations"],
      })
      .errors({ RESERVATION_NOT_FOUND })
      .input(IdParamsSchema)
      .output(ReservationSchema),
  },
}
