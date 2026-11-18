import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import pRetry from "p-retry"
import postgres from "postgres"

export function createDatabase(url: string) {
  // Silence NOTICE messages such as "schema already exists, skipping".
  return drizzle(postgres(url, { onnotice: () => {} }))
}

export type Database = ReturnType<typeof createDatabase>

/** Retries `select 1` so the API survives starting before PostgreSQL accepts connections. */
export async function waitForDatabase(
  db: Database,
  { attempts = 30, delayMs = 1000 } = {}
) {
  await pRetry(() => db.execute(sql`select 1`), {
    retries: attempts - 1,
    factor: 1,
    minTimeout: delayMs,
    onFailedAttempt: ({ attemptNumber, retriesLeft }) => {
      if (retriesLeft > 0)
        console.warn(
          `Database not reachable (attempt ${attemptNumber}/${attempts}), retrying in ${delayMs}ms`
        )
    },
  })
}
