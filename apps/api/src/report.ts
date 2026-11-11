import { loadConfig } from "./config"
import { createDatabase, waitForDatabase } from "./db/client"
import { runReport, runScheduledReport } from "./reports/run"

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)

try {
  await waitForDatabase(db)
  const report = config.REPORT_ID
    ? await runReport(db, config.REPORT_ID, config.JOB_NAME ?? null)
    : await runScheduledReport(db, {
        now: new Date(),
        timeZone: config.APP_TIME_ZONE,
        days: config.REPORT_WINDOW_DAYS ?? 7,
        jobName: config.JOB_NAME,
      })
  console.log(`Report ${report.id}: ${report.status}`)
  if (report.status !== "succeeded") process.exitCode = 1
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.$client.end({ timeout: 5 })
}
