import { z } from "zod"

function isTimeZone(timeZone: string) {
  try {
    return Boolean(new Intl.DateTimeFormat("en", { timeZone }))
  } catch {
    return false
  }
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .startsWith("postgres", "DATABASE_URL must be a postgres:// URL"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Time zone used to decide whether a reservation is in the past. */
  APP_TIME_ZONE: z
    .string()
    .default("Asia/Shanghai")
    .refine(isTimeZone, "APP_TIME_ZONE must be an IANA time zone"),
  DB_SEED_ON_START: z.stringbool().default(true),
  // Runtime entrypoints supply report defaults when these optional settings are absent.
  REPORT_RUNNER: z.enum(["inline", "kubernetes"]).optional(),
  REPORT_CRONJOB_NAME: z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
    .max(52)
    .optional(),
  REPORT_WINDOW_DAYS: z.coerce.number().int().min(1).max(366).optional(),
  REPORT_ID: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  JOB_NAME: z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/)
    .max(63)
    .optional(),
  KUBERNETES_SERVICE_HOST: z.string().min(1).optional(),
  KUBERNETES_SERVICE_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional(),
})

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}
