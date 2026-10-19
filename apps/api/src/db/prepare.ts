import { migrate } from "drizzle-orm/postgres-js/migrator"

import type { Database, DatabaseClient } from "./client"
import { seedDemoVenues } from "./seed"

/** Arbitrary application-wide key for the advisory lock below. */
const PREPARE_LOCK_KEY = 30_074_001

/**
 * Applies pending migrations and seeds demo data. A session-level advisory lock
 * serializes this step, so several API instances can start at the same time safely.
 */
export async function prepareDatabase(
  { client, db }: { client: DatabaseClient; db: Database },
  options: { migrationsFolder: string; migrate: boolean; seed: boolean }
) {
  const lock = await client.reserve()
  try {
    await lock`select pg_advisory_lock(${PREPARE_LOCK_KEY})`
    if (options.migrate) {
      await migrate(db, { migrationsFolder: options.migrationsFolder })
      console.log("Database migrations are up to date")
    }
    if (options.seed) {
      const inserted = await seedDemoVenues(db)
      if (inserted > 0) console.log(`Seeded ${inserted} demo venues`)
    }
  } finally {
    await lock`select pg_advisory_unlock(${PREPARE_LOCK_KEY})`.catch(() => {})
    lock.release()
  }
}
