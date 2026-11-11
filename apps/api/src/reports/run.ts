import type { Report, VenueUtilisation } from "@venue/contracts"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"

import type { Database } from "../db/client"
import { reports, reservations, venues } from "../db/schema"
import { wallClock } from "../lib/time"

export type ReportRecord = typeof reports.$inferSelect
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export function scheduledWindow(now: Date, timeZone: string, days: number) {
  const from = wallClock(now, timeZone).date
  const end = new Date(`${from}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + days - 1)
  return { from, to: end.toISOString().slice(0, 10) }
}

export function toReport(row: ReportRecord): Report {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

function matchesJob(jobName: string | null) {
  return jobName === null
    ? isNull(reports.jobName)
    : eq(reports.jobName, jobName)
}

export async function failReport(
  db: Database | Transaction,
  id: number,
  jobName: string | null,
  error: string
) {
  const [row] = await db
    .update(reports)
    .set({
      status: "failed",
      error,
      finishedAt: sql`clock_timestamp()`,
      results: null,
    })
    .where(
      and(
        eq(reports.id, id),
        matchesJob(jobName),
        inArray(reports.status, ["pending", "running"])
      )
    )
    .returning()
  return row
}

export async function aggregateReport(
  db: Database | Transaction,
  from: string,
  to: string
): Promise<VenueUtilisation[]> {
  return db
    .select({
      venueId: venues.id,
      venueName: venues.name,
      reservationCount: sql<number>`count(${reservations.id})::int`,
      bookedMinutes: sql<number>`coalesce(sum(extract(epoch from (${reservations.endTime} - ${reservations.startTime})) / 60), 0)::int`,
    })
    .from(venues)
    .leftJoin(
      reservations,
      and(
        eq(reservations.venueId, venues.id),
        eq(reservations.status, "confirmed"),
        sql`${reservations.date} between ${from} and ${to}`
      )
    )
    .groupBy(venues.id)
    .orderBy(asc(venues.id))
}

export async function runReport(
  db: Database,
  id: number,
  jobName: string | null = null
) {
  try {
    const started = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(reports)
        .where(eq(reports.id, id))
        .for("update")
      if (!row) throw new Error("Report not found")
      if (row.jobName !== jobName || row.status !== "pending") return row

      const [running] = await tx
        .update(reports)
        .set({
          status: "running",
          jobName,
          startedAt: sql`clock_timestamp()`,
          finishedAt: null,
          error: null,
          results: null,
        })
        .where(and(eq(reports.id, id), matchesJob(row.jobName)))
        .returning()
      return running!
    })
    if (started.jobName !== jobName || started.status !== "running")
      return started

    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(reports)
        .where(eq(reports.id, id))
        .for("update")
      if (!row) throw new Error("Report not found")
      if (row.jobName !== jobName || row.status !== "running") return row

      try {
        // A savepoint lets a failed SQL statement roll back without losing the locked row's failure status.
        const results = await tx.transaction((snapshot) =>
          aggregateReport(snapshot, row.from, row.to)
        )
        const [finished] = await tx
          .update(reports)
          .set({
            status: "succeeded",
            results,
            finishedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(reports.id, id),
              matchesJob(jobName),
              eq(reports.status, "running")
            )
          )
          .returning()
        return finished!
      } catch (error) {
        console.error(error)
        return (await failReport(tx, id, jobName, "Report generation failed"))!
      }
    })
  } catch (error) {
    await failReport(db, id, jobName, "Report generation failed")
    throw error
  }
}

export async function runScheduledReport(
  db: Database,
  {
    now,
    timeZone,
    days,
    jobName = null,
  }: { now: Date; timeZone: string; days: number; jobName?: string | null }
) {
  const window = scheduledWindow(now, timeZone, days)
  const [row] = await db
    .insert(reports)
    .values({ trigger: "scheduled", ...window, jobName })
    .onConflictDoUpdate({
      target: [reports.from, reports.to],
      targetWhere: sql`${reports.trigger} = 'scheduled'`,
      // Persist the new Job before running, so a killed worker can be reconciled.
      set: {
        status: "pending",
        jobName,
        createdAt: sql`now()`,
        startedAt: null,
        finishedAt: null,
        error: null,
        results: null,
      },
      setWhere:
        jobName === null
          ? sql`true`
          : sql`${reports.jobName} is distinct from ${jobName}`,
    })
    .returning()
  const existing =
    row ??
    (
      await db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.trigger, "scheduled"),
            eq(reports.from, window.from),
            eq(reports.to, window.to)
          )
        )
    )[0]!
  return runReport(db, existing.id, jobName)
}
