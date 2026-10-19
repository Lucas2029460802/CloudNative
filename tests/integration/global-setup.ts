import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import type { TestProject } from "vitest/node"

import { createDatabase, waitForDatabase } from "../../apps/api/src/db/client"
import { prepareDatabase } from "../../apps/api/src/db/prepare"

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

const POSTGRES_IMAGE = "postgres:18.6-alpine3.24"
const migrationsFolder = fileURLToPath(
  new URL("../../apps/api/drizzle", import.meta.url)
)

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim()
}

/**
 * Provides an empty, migrated PostgreSQL database to the integration tests.
 * Set TEST_DATABASE_URL to reuse an existing disposable database instead of Docker;
 * the tests truncate its tables.
 */
export default async function setup(project: TestProject) {
  let containerId: string | undefined
  let databaseUrl = process.env.TEST_DATABASE_URL

  if (!databaseUrl) {
    containerId = docker(
      "run",
      "--detach",
      "--rm",
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_PASSWORD=test",
      "--env",
      "POSTGRES_DB=venue_test",
      POSTGRES_IMAGE
    )
    const hostPort = docker("port", containerId, "5432/tcp").split(":").at(-1)
    databaseUrl = `postgres://postgres:test@127.0.0.1:${hostPort}/venue_test`
  }

  const db = createDatabase(databaseUrl)
  try {
    // PostgreSQL accepts TCP connections only after its first-run initialization.
    await waitForDatabase(db, { attempts: 60, delayMs: 500 })
    await prepareDatabase(db, { migrationsFolder, seed: false })
  } finally {
    await db.$client.end()
  }

  project.provide("databaseUrl", databaseUrl)

  return () => {
    if (containerId) docker("stop", containerId)
  }
}
