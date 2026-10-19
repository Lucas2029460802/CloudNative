import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
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
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql`select 1`)
      return
    } catch (error) {
      if (attempt >= attempts) throw error
      console.warn(
        `Database not reachable (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms`
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
