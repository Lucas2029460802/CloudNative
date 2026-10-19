import { migrate } from "drizzle-orm/postgres-js/migrator"

import type { Database } from "./client"
import { seedDemoVenues } from "./seed"

/** Arbitrary application-wide key for the advisory lock below. */
const PREPARE_LOCK_KEY = 30_074_001

/**
 * Applies pending migrations and optionally seeds demo data. A session-level advisory
 * lock serializes this step, so several API instances can start at the same time safely.
 */
export async function prepareDatabase(
  db: Database,
  { migrationsFolder, seed }: { migrationsFolder: string; seed: boolean }
) {
  const lock = await db.$client.reserve()
  try {
    await lock`select pg_advisory_lock(${PREPARE_LOCK_KEY})`
    await migrate(db, { migrationsFolder })
    console.log("Database migrations are up to date")
    const seeded = seed ? await seedDemoVenues(db) : 0
    if (seeded > 0) console.log(`Seeded ${seeded} demo venues`)
  } finally {
    await lock`select pg_advisory_unlock(${PREPARE_LOCK_KEY})`.catch(() => {})
    lock.release()
  }
}
