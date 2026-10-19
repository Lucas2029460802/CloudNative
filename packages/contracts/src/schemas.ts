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
