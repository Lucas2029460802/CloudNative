import type { Reservation } from "@venue/contracts"
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import postgres from "postgres"

import type { Database } from "../db/client"
import { reservations, venues } from "../db/schema"
import { toHourMinute, wallClock } from "../lib/time"
import { os } from "./base"

/** SQLSTATE raised when the `reservations_no_overlap` exclusion constraint is violated. */
const EXCLUSION_VIOLATION = "23P01"

function selectReservations(db: Database) {
  return db
    .select({
      ...getTableColumns(reservations),
      venue: { id: venues.id, name: venues.name, location: venues.location },
    })
    .from(reservations)
    .innerJoin(venues, eq(reservations.venueId, venues.id))
}

type ReservationRecord = Awaited<ReturnType<typeof selectReservations>>[number]

function toReservation(row: ReservationRecord): Reservation {
  return {
    ...row,
    startTime: toHourMinute(row.startTime),
    endTime: toHourMinute(row.endTime),
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  }
}

async function findReservation(db: Database, id: number) {
  const [row] = await selectReservations(db).where(eq(reservations.id, id))
  return row && toReservation(row)
}

/** Confirmed reservations of the venue whose half-open [start, end) range overlaps the request. */
async function findConflicts(
  db: Database,
  request: { venueId: number; date: string; startTime: string; endTime: string }
) {
  const rows = await db
    .select({
      id: reservations.id,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.venueId, request.venueId),
        eq(reservations.date, request.date),
        eq(reservations.status, "confirmed"),
        lt(reservations.startTime, request.endTime),
        gt(reservations.endTime, request.startTime)
      )
    )
    .orderBy(asc(reservations.startTime))
  return rows.map((row) => ({
    id: row.id,
    startTime: toHourMinute(row.startTime),
    endTime: toHourMinute(row.endTime),
  }))
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export const reservationsRouter = {
  list: os.reservations.list.handler(async ({ input, context }) => {
    const filters: (SQL | undefined)[] = []
    if (input.venueId) filters.push(eq(reservations.venueId, input.venueId))
    if (input.date) filters.push(eq(reservations.date, input.date))
    if (input.from) filters.push(gte(reservations.date, input.from))
    if (input.status) filters.push(eq(reservations.status, input.status))
    if (input.q) {
      const pattern = `%${escapeLikePattern(input.q)}%`
      filters.push(
        or(
          ilike(reservations.bookerName, pattern),
          ilike(reservations.purpose, pattern)
        )
      )
    }
    const rows = await selectReservations(context.db)
      .where(and(...filters))
      .orderBy(
        asc(reservations.date),
        asc(reservations.startTime),
        asc(reservations.id)
      )
    return rows.map(toReservation)
  }),

  get: os.reservations.get.handler(async ({ input, context, errors }) => {
    const reservation = await findReservation(context.db, input.id)
    if (!reservation) throw errors.RESERVATION_NOT_FOUND()
    return reservation
  }),

  create: os.reservations.create.handler(async ({ input, context, errors }) => {
    const { db } = context
    try {
      return await db.transaction(async (tx) => {
        // Serialize bookings per venue before exclusion checks can deadlock.
        const [venue] = await tx
          .select()
          .from(venues)
          .where(eq(venues.id, input.venueId))
          .for("update")
        if (!venue) throw errors.VENUE_NOT_FOUND()
        if (venue.status !== "open") throw errors.VENUE_DISABLED()

        const now = wallClock(context.now(), context.timeZone)
        if (
          input.date < now.date ||
          (input.date === now.date && input.startTime <= now.time)
        ) {
          throw errors.RESERVATION_IN_PAST()
        }

        const openTime = toHourMinute(venue.openTime)
        const closeTime = toHourMinute(venue.closeTime)
        if (input.startTime < openTime || input.endTime > closeTime) {
          throw errors.OUTSIDE_OPENING_HOURS({
            message: `${venue.name} is open from ${openTime} to ${closeTime}`,
            data: { openTime, closeTime },
          })
        }

        if (input.attendeeCount > venue.capacity) {
          throw errors.CAPACITY_EXCEEDED({
            message: `${venue.name} holds at most ${venue.capacity} people`,
            data: { capacity: venue.capacity },
          })
        }

        const [created] = await tx
          .insert(reservations)
          .values(input)
          .returning()
        const { id, name, location } = venue
        return toReservation({ ...created!, venue: { id, name, location } })
      })
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !(error.cause instanceof postgres.PostgresError) ||
        error.cause.code !== EXCLUSION_VIOLATION
      ) {
        throw error
      }
      const conflicts = await findConflicts(db, input)
      throw errors.RESERVATION_CONFLICT({
        message: `The requested time overlaps ${conflicts.length} existing reservation(s)`,
        data: { conflicts },
      })
    }
  }),

  cancel: os.reservations.cancel.handler(async ({ input, context, errors }) => {
    // Logical cancellation keeps the record; only confirmed reservations change,
    // which makes cancelling an already cancelled reservation a no-op.
    await context.db
      .update(reservations)
      .set({ status: "cancelled", cancelledAt: sql`now()` })
      .where(
        and(eq(reservations.id, input.id), eq(reservations.status, "confirmed"))
      )
    const reservation = await findReservation(context.db, input.id)
    if (!reservation) throw errors.RESERVATION_NOT_FOUND()
    return reservation
  }),
}
