import { serve } from "@hono/node-server"

import { createApp } from "./app"
import { loadConfig } from "./config"
import { createDatabase, waitForDatabase } from "./db/client"
import { prepareDatabase } from "./db/prepare"

const config = loadConfig()
const database = createDatabase(config.DATABASE_URL, {
  max: config.DATABASE_POOL_MAX,
})

await waitForDatabase(database.client)
await prepareDatabase(database, {
  migrationsFolder: config.MIGRATIONS_DIR,
  migrate: config.DB_MIGRATE_ON_START,
  seed: config.DB_SEED_ON_START,
})

const app = createApp({
  ...database,
  timeZone: config.APP_TIME_ZONE,
  logRequests: true,
})

const server = serve(
  { fetch: app.fetch, hostname: config.HOST, port: config.PORT },
  (info) => console.log(`API listening on http://${info.address}:${info.port}`)
)

function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`)
  // Force exit if open connections keep the server from closing in time.
  setTimeout(() => process.exit(1), 10_000).unref()
  server.close(async () => {
    await database.client.end({ timeout: 5 })
    process.exit(0)
  })
}

process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
