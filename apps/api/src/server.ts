import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"

import { createApp } from "./app"
import { loadConfig } from "./config"
import { createDatabase, waitForDatabase } from "./db/client"
import { prepareDatabase } from "./db/prepare"

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)

await waitForDatabase(db)
await prepareDatabase(db, {
  // drizzle/ sits next to src/ in the repository and next to dist/ in the image.
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  seed: config.DB_SEED_ON_START,
})

const app = createApp({
  db,
  timeZone: config.APP_TIME_ZONE,
  logRequests: true,
})

const server = serve(
  { fetch: app.fetch, hostname: "0.0.0.0", port: config.PORT },
  (info) => console.log(`API listening on http://${info.address}:${info.port}`)
)

function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`)
  server.close(async () => {
    await db.$client.end({ timeout: 5 })
    process.exit(0)
  })
}

process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
