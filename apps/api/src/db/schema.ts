import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

export const venueStatus = pgEnum("venue_status", ["open", "disabled"])
export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
])

export const venues = pgTable(
  "venues",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 100 }).notNull(),
    location: varchar("location", { length: 200 }).notNull(),
    capacity: integer("capacity").notNull(),
    openTime: time("open_time").notNull(),
    closeTime: time("close_time").notNull(),
    status: venueStatus("status").notNull().default("open"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("venues_capacity_positive", sql`${table.capacity} > 0`),
    check(
      "venues_opening_hours_valid",
      sql`${table.openTime} < ${table.closeTime}`
    ),
  ]
)

// Overlapping confirmed reservations are additionally rejected by the
// `reservations_no_overlap` exclusion constraint (see drizzle/0001_*.sql),
// which Drizzle cannot express in the schema.
export const reservations = pgTable(
  "reservations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    bookerName: varchar("booker_name", { length: 100 }).notNull(),
    attendeeCount: integer("attendee_count").notNull(),
    date: date("reservation_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    purpose: varchar("purpose", { length: 500 }).notNull(),
    status: reservationStatus("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("reservations_venue_date_idx").on(table.venueId, table.date),
    check(
      "reservations_time_range_valid",
      sql`${table.startTime} < ${table.endTime}`
    ),
    check(
      "reservations_attendee_count_positive",
      sql`${table.attendeeCount} > 0`
    ),
    check(
      "reservations_cancelled_at_matches_status",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL)`
    ),
  ]
)

export type VenueRow = typeof venues.$inferSelect
export type ReservationRow = typeof reservations.$inferSelect
