import {
  ApiException,
  BatchV1Api,
  KubeConfig,
  Observable,
  type ObservableMiddleware,
  type V1CronJob,
  type V1Job,
} from "@kubernetes/client-node"
import { eq } from "drizzle-orm"

import type { Database } from "../db/client"
import { reports } from "../db/schema"
import { failReport, type ReportRecord } from "./run"

export type ReportLauncher = {
  launch: (id: number, jobName: string) => Promise<void>
  getJob: (jobName: string) => Promise<V1Job | null>
}

export type BatchClient = Pick<
  BatchV1Api,
  "readNamespacedCronJob" | "createNamespacedJob" | "readNamespacedJob"
>

export function buildReportJob(
  cronJob: V1CronJob,
  reportId: number,
  jobName: string
): V1Job {
  const spec = structuredClone(cronJob.spec?.jobTemplate.spec)
  const container = spec?.template.spec?.containers.find(
    (item) => item.name === "report"
  )
  if (!spec || !container) throw new Error("CronJob has no report container")
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

export function reportJobFailure(job: V1Job) {
  return job.status?.conditions?.find(
    (condition) => condition.type === "Failed" && condition.status === "True"
  )
}

/** Bounds every Kubernetes API call, so a stuck apiserver cannot hold a request open. */
const timeout: ObservableMiddleware = {
  pre: (request) => {
    request.setSignal(AbortSignal.timeout(5000))
    return new Observable(Promise.resolve(request))
  },
  post: (response) => new Observable(Promise.resolve(response)),
}
const options = {
  middleware: [timeout],
  middlewareMergeStrategy: "append" as const,
}

/** The ServiceAccount's in-cluster credentials: apiserver address, CA, rotating token, namespace. */
function inClusterClient() {
  const config = new KubeConfig()
  config.loadFromCluster()
  return {
    batch: config.makeApiClient(BatchV1Api),
    namespace: config.getContextObject(config.currentContext)?.namespace,
  }
}

// Report only the HTTP status: the response body is not needed to diagnose RBAC or missing objects.
function httpError(error: unknown, action: string) {
  return error instanceof ApiException
    ? new Error(`Could not ${action} (HTTP ${error.code})`)
    : error
}

export function createKubernetesLauncher(
  { cronJobName = "venue-report" }: { cronJobName?: string } = {},
  {
    batch,
    namespace,
  }: { batch: BatchClient; namespace?: string } = inClusterClient()
): ReportLauncher {
  function inNamespace() {
    if (!namespace) throw new Error("Kubernetes namespace is unavailable")
    return namespace
  }

  return {
    async launch(id, jobName) {
      const cronJob = await batch
        .readNamespacedCronJob(
          { name: cronJobName, namespace: inNamespace() },
          options
        )
        .catch((error: unknown) => {
          throw httpError(error, "read report CronJob")
        })
      await batch
        .createNamespacedJob(
          {
            namespace: inNamespace(),
            body: buildReportJob(cronJob, id, jobName),
          },
          options
        )
        .catch((error: unknown) => {
          if (!(error instanceof ApiException && error.code === 409))
            throw httpError(error, "create report Job")
        })
    },
    async getJob(jobName) {
      return batch
        .readNamespacedJob({ name: jobName, namespace: inNamespace() }, options)
        .catch((error: unknown) => {
          if (error instanceof ApiException && error.code === 404) return null
          throw httpError(error, "read report Job")
        })
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
  let job: V1Job | null
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
