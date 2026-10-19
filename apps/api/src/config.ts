import { z } from "zod"

function isTimeZone(value: string) {
  try {
    return Boolean(
      new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
        .timeZone
    )
  } catch {
    return false
  }
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Time zone used to decide whether a reservation is in the past. */
  APP_TIME_ZONE: z
    .string()
    .default("Asia/Shanghai")
    .refine(isTimeZone, "APP_TIME_ZONE must be an IANA time zone"),
  MIGRATIONS_DIR: z.string().default("drizzle"),
  DB_MIGRATE_ON_START: z.stringbool().default(true),
  DB_SEED_ON_START: z.stringbool().default(true),
})

export type Config = z.infer<typeof EnvSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment configuration:\n${problems}`)
  }
  return result.data
}
