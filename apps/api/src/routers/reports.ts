import { randomBytes } from "node:crypto"
import { desc, eq } from "drizzle-orm"

import { reports } from "../db/schema"
import { reconcileReport } from "../reports/launcher"
import { failReport, runReport, toReport } from "../reports/run"
import { os } from "./base"

export const reportsRouter = {
  list: os.reports.list.handler(async ({ context }) => {
    const rows = await context.db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(50)
    return Promise.all(
      rows.map(async (row) =>
        toReport(
          context.reportLauncher
            ? await reconcileReport(
                context.db,
                row,
                context.reportLauncher,
                context.now()
              )
            : row
        )
      )
    )
  }),
  get: os.reports.get.handler(async ({ input, context, errors }) => {
    const [row] = await context.db
      .select()
      .from(reports)
      .where(eq(reports.id, input.id))
    if (!row) throw errors.REPORT_NOT_FOUND()
    return toReport(
      context.reportLauncher
        ? await reconcileReport(
            context.db,
            row,
            context.reportLauncher,
            context.now()
          )
        : row
    )
  }),
  create: os.reports.create.handler(async ({ input, context, errors }) => {
    const { db, reportLauncher } = context
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(reports)
        .values({ trigger: "manual", ...input })
        .returning()
      if (!reportLauncher) return created!
      const jobName = `venue-report-manual-${created!.id}-${randomBytes(3).toString("hex").slice(0, 5)}`
      const [named] = await tx
        .update(reports)
        .set({ jobName })
        .where(eq(reports.id, created!.id))
        .returning()
      return named!
    })
    if (!reportLauncher) return toReport(await runReport(db, row.id))
    try {
      await reportLauncher.launch(row.id, row.jobName!)
    } catch (error) {
      console.error(error)
      try {
        if (await reportLauncher.getJob(row.jobName!)) return toReport(row)
      } catch (lookupError) {
        console.error(lookupError)
      }
      await failReport(db, row.id, row.jobName, "Report runner is unavailable")
      throw errors.REPORT_RUNNER_UNAVAILABLE()
    }
    return toReport(row)
  }),
}
