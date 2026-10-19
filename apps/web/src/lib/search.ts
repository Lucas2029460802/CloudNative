import { CalendarDateSchema } from "@venue/contracts"
import { z } from "zod"

/** `?date=YYYY-MM-DD`; malformed values fall back to today instead of failing the page. */
export const dateSearchSchema = z.object({
  date: CalendarDateSchema.optional().catch(undefined),
})
