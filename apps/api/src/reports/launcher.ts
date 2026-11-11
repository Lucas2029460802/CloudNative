import { readFile } from "node:fs/promises"
import { eq } from "drizzle-orm"

import type { Database } from "../db/client"
import { reports } from "../db/schema"
import { failReport, type ReportRecord } from "./run"

type JobSpec = {
  template: {
    metadata?: { labels?: Record<string, string>; [key: string]: unknown }
    spec: {
      containers: {
        name: string
        env?: { name: string; [key: string]: unknown }[]
        [key: string]: unknown
      }[]
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

type CronJob = { spec: { jobTemplate: { spec: JobSpec } } }
export type ReportJob = {
  status?: {
    conditions?: readonly { type: string; status: string; reason?: string }[]
  }
}

export type ReportLauncher = {
  launch: (id: number, jobName: string) => Promise<void>
  getJob: (jobName: string) => Promise<ReportJob | null>
}

export function buildReportJob(
  cronJob: CronJob,
  reportId: number,
  jobName: string
) {
  const spec = structuredClone(cronJob.spec.jobTemplate.spec)
  const container = spec.template.spec.containers.find(
    (item) => item.name === "report"
  )
  if (!container) throw new Error("CronJob has no report container")
  container.env = [
    ...(container.env ?? []).filter((item) => item.name !== "REPORT_ID"),
    { name: "REPORT_ID", value: String(reportId) },
  ]
  const labels = {
    "app.kubernetes.io/name": "venue-report",
    "venue-booking/report-id": String(reportId),
  }
  spec.template.metadata = {
    ...spec.template.metadata,
    labels: { ...spec.template.metadata?.labels, ...labels },
  }
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: jobName, labels },
    spec,
  }
}

export function reportJobFailure(job: ReportJob) {
  return job.status?.conditions?.find(
    (condition) => condition.type === "Failed" && condition.status === "True"
  )
}

export function createKubernetesLauncher(
  {
    host,
    port = 443,
    cronJobName = "venue-report",
  }: { host?: string; port?: number; cronJobName?: string },
  {
    fetch: request = fetch,
    readSecret = (name: string) =>
      readFile(`/var/run/secrets/kubernetes.io/serviceaccount/${name}`, "utf8"),
  } = {}
): ReportLauncher {
  async function call(resource: string, init?: RequestInit) {
    if (!host) throw new Error("Kubernetes service host is unavailable")
    const namespace = (await readSecret("namespace")).trim()
    const token = (await readSecret("token")).trim()
    const address =
      host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
    return request(
      `https://${address}:${port}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/${resource}`,
      {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      }
    )
  }

  return {
    async launch(id, jobName) {
      const template = await call(`cronjobs/${encodeURIComponent(cronJobName)}`)
      if (!template.ok)
        throw new Error(
          `Could not read report CronJob (HTTP ${template.status})`
        )
      const job = buildReportJob(
        (await template.json()) as CronJob,
        id,
        jobName
      )
      const created = await call("jobs", {
        method: "POST",
        body: JSON.stringify(job),
      })
      if (!created.ok && created.status !== 409)
        throw new Error(`Could not create report Job (HTTP ${created.status})`)
    },
    async getJob(jobName) {
      const response = await call(`jobs/${encodeURIComponent(jobName)}`)
      if (response.status === 404) return null
      if (!response.ok)
        throw new Error(`Could not read report Job (HTTP ${response.status})`)
      return response.json() as Promise<ReportJob>
    },
  }
}

export async function reconcileReport(
  db: Database,
  row: ReportRecord,
  launcher: ReportLauncher,
  now: Date
) {
  if (!row.jobName || (row.status !== "pending" && row.status !== "running"))
    return row
  let job: ReportJob | null
  try {
    job = await launcher.getJob(row.jobName)
  } catch (error) {
    console.error(error)
    // A temporary Kubernetes API outage says nothing about whether the worker succeeded.
    return row
  }
  const failed = job === null ? undefined : reportJobFailure(job)
  const missing =
    job === null && now.getTime() - row.createdAt.getTime() > 60_000
  if (!failed && !missing) return row
  const reason = failed?.reason
  const safeReason =
    reason &&
    [
      "DeadlineExceeded",
      "BackoffLimitExceeded",
      "PodFailurePolicy",
      "FailedIndexes",
      "MaxFailedIndexesExceeded",
    ].includes(reason)
      ? ` (${reason})`
      : ""
  const updated = await failReport(
    db,
    row.id,
    row.jobName,
    missing ? "Report Job was not found" : `Report Job failed${safeReason}`
  )
  if (updated) return updated
  // The worker may have completed (or a new scheduled Job claimed the row) while GET was in flight.
  const [current] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, row.id))
  return current ?? row
}
