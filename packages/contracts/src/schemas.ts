import { z } from "zod"

/** Largest value a PostgreSQL `integer` column can hold. */
const MAX_INT = 2_147_483_647

/** Wall-clock time of day in 24-hour `HH:mm` format, e.g. `09:30`. */
export const TimeOfDaySchema = z.iso.time({
  precision: -1,
  error: "Use the 24-hour HH:mm format",
})

/** Calendar date in `YYYY-MM-DD` format; impossible dates such as 2026-02-30 are rejected. */
export const CalendarDateSchema = z.iso.date({
  error: "Use a valid date in YYYY-MM-DD format",
})

/** Resource id. Path and query parameters arrive as strings, so the value is coerced. */
export const IdSchema = z.coerce.number<number>().int().positive().max(MAX_INT)

export const IdParamsSchema = z.object({ id: IdSchema })

export const VenueStatusSchema = z.enum(["open", "disabled"])
export type VenueStatus = z.infer<typeof VenueStatusSchema>

export const ReservationStatusSchema = z.enum(["confirmed", "cancelled"])

export const VenueSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  location: z.string(),
  capacity: z.number().int(),
  openTime: TimeOfDaySchema,
  closeTime: TimeOfDaySchema,
  status: VenueStatusSchema,
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type Venue = z.infer<typeof VenueSchema>

export const CreateVenueInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    location: z.string().trim().min(1, "Location is required").max(200),
    capacity: z.number().int().min(1).max(10_000),
    openTime: TimeOfDaySchema,
    closeTime: TimeOfDaySchema,
    status: VenueStatusSchema.default("open"),
    description: z.string().trim().max(500).optional(),
  })
  .refine((venue) => venue.openTime < venue.closeTime, {
    path: ["closeTime"],
    message: "Closing time must be later than opening time",
  })

export const ReservationSchema = z.object({
  id: z.number().int(),
  venueId: z.number().int(),
  venue: z.object({
    id: z.number().int(),
    name: z.string(),
    location: z.string(),
  }),
  bookerName: z.string(),
  attendeeCount: z.number().int(),
  date: CalendarDateSchema,
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  purpose: z.string(),
  status: ReservationStatusSchema,
  createdAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(),
})
export type Reservation = z.infer<typeof ReservationSchema>

export const CreateReservationInputSchema = z
  .object({
    venueId: z.number().int().positive().max(MAX_INT),
    bookerName: z.string().trim().min(1, "Name is required").max(100),
    attendeeCount: z.number().int().min(1).max(10_000),
    date: CalendarDateSchema,
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
    purpose: z.string().trim().min(1, "Purpose is required").max(500),
  })
  .refine((reservation) => reservation.startTime < reservation.endTime, {
    path: ["endTime"],
    message: "End time must be later than start time",
  })

export const ListReservationsQuerySchema = z.object({
  venueId: IdSchema.optional(),
  /** Only reservations on this exact date. */
  date: CalendarDateSchema.optional(),
  /** Only reservations on or after this date. */
  from: CalendarDateSchema.optional(),
  status: ReservationStatusSchema.optional(),
  /** Case-insensitive search over the booker name and purpose. */
  q: z.string().trim().max(100).optional(),
})

export const ReservationConflictSchema = z.object({
  id: z.number().int(),
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
})

/** Longest date range one utilisation report may cover, in days (inclusive). */
export const MAX_REPORT_DAYS = 366

export const ReportStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
])
export type ReportStatus = z.infer<typeof ReportStatusSchema>

/** `manual`: requested through the API. `scheduled`: written by the CronJob. */
export const ReportTriggerSchema = z.enum(["manual", "scheduled"])

/** Utilisation of one venue within the report's date range. */
export const VenueUtilisationSchema = z.object({
  venueId: z.number().int(),
  venueName: z.string(),
  reservationCount: z.number().int(),
  bookedMinutes: z.number().int(),
})
export type VenueUtilisation = z.infer<typeof VenueUtilisationSchema>

export const ReportSchema = z.object({
  id: z.number().int(),
  trigger: ReportTriggerSchema,
  /** First and last calendar date covered, both inclusive. */
  from: CalendarDateSchema,
  to: CalendarDateSchema,
  status: ReportStatusSchema,
  /** Kubernetes Job that runs the report; null when it ran inside the API process. */
  jobName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  /** Every venue, including those without reservations; null until the report succeeds. */
  results: z.array(VenueUtilisationSchema).nullable(),
})
export type Report = z.infer<typeof ReportSchema>

const DAY_MS = 86_400_000

export const CreateReportInputSchema = z
  .object({ from: CalendarDateSchema, to: CalendarDateSchema })
  .refine((range) => range.from <= range.to, {
    path: ["to"],
    message: "End date must not be earlier than start date",
  })
  .refine(
    (range) =>
      (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS <
      MAX_REPORT_DAYS,
    {
      path: ["to"],
      message: `A report covers at most ${MAX_REPORT_DAYS} days`,
    }
  )
