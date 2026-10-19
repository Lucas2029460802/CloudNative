import type { Venue } from "@venue/contracts"
import { asc, eq } from "drizzle-orm"

import { venues, type VenueRow } from "../db/schema"
import { toHourMinute } from "../lib/time"
import { os } from "./base"

function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    capacity: row.capacity,
    openTime: toHourMinute(row.openTime),
    closeTime: toHourMinute(row.closeTime),
    status: row.status,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  }
}

export const venuesRouter = {
  list: os.venues.list.handler(async ({ context }) => {
    const rows = await context.db.select().from(venues).orderBy(asc(venues.id))
    return rows.map(toVenue)
  }),

  get: os.venues.get.handler(async ({ input, context, errors }) => {
    const [row] = await context.db
      .select()
      .from(venues)
      .where(eq(venues.id, input.id))
    if (!row) throw errors.VENUE_NOT_FOUND()
    return toVenue(row)
  }),

  create: os.venues.create.handler(async ({ input, context }) => {
    const [row] = await context.db
      .insert(venues)
      .values({ ...input, description: input.description || null })
      .returning()
    return toVenue(row!)
  }),
}
