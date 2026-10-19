// Manual database tasks: `bun run db:migrate` / `bun run db:seed`.
// The API server performs both automatically on start unless disabled via env.
import { loadConfig } from "../config"
import { createDatabase } from "./client"
import { prepareDatabase } from "./prepare"

const task = process.argv[2]
if (task !== "migrate" && task !== "seed") {
  console.error("Usage: cli.ts <migrate|seed>")
  process.exit(1)
}

const config = loadConfig()
const database = createDatabase(config.DATABASE_URL, { max: 2 })
try {
  await prepareDatabase(database, {
    migrationsFolder: config.MIGRATIONS_DIR,
    migrate: task === "migrate",
    seed: task === "seed",
  })
} finally {
  await database.client.end()
}
