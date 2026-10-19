import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema"

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    connect_timeout: 10,
    // Silence NOTICE messages such as "relation already exists, skipping".
    onnotice: () => {},
  })
  return { client, db: drizzle({ client, schema }) }
}

export type DatabaseClient = ReturnType<typeof createDatabase>["client"]
export type Database = ReturnType<typeof createDatabase>["db"]

/** Retries `select 1` so the API survives starting before PostgreSQL accepts connections. */
export async function waitForDatabase(
  client: DatabaseClient,
  { attempts = 30, delayMs = 1000 } = {}
) {
  for (let attempt = 1; ; attempt++) {
    try {
      await client`select 1`
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
