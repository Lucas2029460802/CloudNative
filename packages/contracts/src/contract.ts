import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  CreateReportInputSchema,
  CreateReservationInputSchema,
  CreateVenueInputSchema,
  IdParamsSchema,
  ListReservationsQuerySchema,
  ReportSchema,
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
  REPORT_NOT_FOUND: { status: 404, message: "Report not found" },
  REPORT_RUNNER_UNAVAILABLE: {
    status: 503,
    message: "The report could not be started; try again later",
  },
} as const

const {
  VENUE_NOT_FOUND,
  RESERVATION_NOT_FOUND,
  REPORT_NOT_FOUND,
  REPORT_RUNNER_UNAVAILABLE,
} = apiErrors

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
  reports: {
    list: oc
      .route({
        method: "GET",
        path: "/reports",
        summary: "List utilisation reports",
        description: "The 50 most recent reports, newest first.",
        tags: ["Reports"],
      })
      .output(z.array(ReportSchema)),
    get: oc
      .route({
        method: "GET",
        path: "/reports/{id}",
        summary: "Get a utilisation report",
        tags: ["Reports"],
      })
      .errors({ REPORT_NOT_FOUND })
      .input(IdParamsSchema)
      .output(ReportSchema),
    create: oc
      .route({
        method: "POST",
        path: "/reports",
        successStatus: 202,
        summary: "Request a utilisation report",
        description:
          "Counts confirmed reservations and booked minutes per venue between `from` and `to` (inclusive). The report runs asynchronously, as a Kubernetes Job when deployed on Kubernetes; poll `GET /reports/{id}` until its status is `succeeded` or `failed`.",
        tags: ["Reports"],
      })
      .errors({ REPORT_RUNNER_UNAVAILABLE })
      .input(CreateReportInputSchema)
      .output(ReportSchema),
  },
}
