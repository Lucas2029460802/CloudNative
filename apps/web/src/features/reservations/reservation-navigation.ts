import { z } from "zod"

import { reservationSearchSchema } from "@/lib/search"

export type ReservationSearch = z.infer<typeof reservationSearchSchema>

// Only known search fields can return to our records route. There is no dynamic
// return URL, so a direct detail link cannot redirect the visitor off-site.
export const reservationDetailSearchSchema = z.object({
  created: z.boolean().optional().catch(undefined),
  back: reservationSearchSchema.optional().catch(undefined),
})
