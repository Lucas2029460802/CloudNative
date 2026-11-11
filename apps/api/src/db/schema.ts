import type { VenueUtilisation } from "@venue/contracts"
import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

export const venueStatus = pgEnum("venue_status", ["open", "disabled"])
export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
])
export const reportTrigger = pgEnum("report_trigger", ["manual", "scheduled"])
export const reportStatus = pgEnum("report_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
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

// Overlapping confirmed reservations are rejected by the `reservations_no_overlap`
// exclusion constraint (see drizzle/0001_*.sql), which Drizzle cannot express here.
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

export const reports = pgTable(
  "reports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    trigger: reportTrigger("trigger").notNull(),
    from: date("from_date", { mode: "string" }).notNull(),
    to: date("to_date", { mode: "string" }).notNull(),
    status: reportStatus("status").notNull().default("pending"),
    jobName: varchar("job_name", { length: 63 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    results: jsonb("results").$type<VenueUtilisation[]>(),
  },
  (table) => [
    uniqueIndex("reports_scheduled_period_idx")
      .on(table.from, table.to)
      .where(sql`${table.trigger} = 'scheduled'`),
    check(
      "reports_date_range_valid",
      sql`${table.to} >= ${table.from} and ${table.to} - ${table.from} < 366`
    ),
  ]
)
