import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Only needed by commands that talk to a database (e.g. `drizzle-kit studio`);
  // `drizzle-kit generate` works offline from the schema file.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
})
