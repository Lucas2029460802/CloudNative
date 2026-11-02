import {
  CalendarDateSchema,
  IdSchema,
  ReservationStatusSchema,
  TimeOfDaySchema,
} from "@venue/contracts"
import { z } from "zod"

/** `?date=YYYY-MM-DD`; malformed values fall back to today instead of failing the page. */
export const dateSearchSchema = z.object({
  date: CalendarDateSchema.optional().catch(undefined),
})

export const boardSearchSchema = dateSearchSchema.extend({
  q: z.string().max(100).optional().catch(undefined),
  people: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .catch(undefined),
  duration: z.coerce
    .number()
    .pipe(z.union([z.literal(30), z.literal(60), z.literal(120)]))
    .optional()
    .catch(undefined),
  view: z.enum(["cards", "timeline"]).optional().catch(undefined),
})

export const bookingSearchSchema = dateSearchSchema.extend({
  start: TimeOfDaySchema.optional().catch(undefined),
  end: TimeOfDaySchema.optional().catch(undefined),
})

export const reservationSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: ReservationStatusSchema.optional().catch(undefined),
  venueId: IdSchema.optional().catch(undefined),
  dates: z.enum(["upcoming", "all"]).optional().catch(undefined),
  date: CalendarDateSchema.optional().catch(undefined),
})
