import { readFile } from "node:fs/promises"
import {
  ApiException,
  BatchV1Api,
  createConfiguration,
  HttpMethod,
  Observable,
  RequestContext,
  ResponseContext,
  SelfDecodingBody,
  ServerConfiguration,
  type V1CronJob,
  type V1Job,
  type V1JobCondition,
} from "@kubernetes/client-node"
import { describe, expect, it, vi } from "vitest"
import { parse } from "yaml"

import { CreateReportInputSchema } from "../../packages/contracts/src/schemas"
import { loadConfig } from "../../apps/api/src/config"
import {
  type BatchClient,
  buildReportJob,
  createKubernetesLauncher,
  reportJobFailure,
} from "../../apps/api/src/reports/launcher"
import { scheduledWindow } from "../../apps/api/src/reports/run"

function cronJob() {
  return {
    spec: {
      schedule: "*/2 * * * *",
      jobTemplate: {
        metadata: {
          ownerReferences: [
            {
              apiVersion: "batch/v1",
              kind: "CronJob",
              name: "venue-report",
              uid: "test",
            },
          ],
        },
        spec: {
          backoffLimit: 0,
          activeDeadlineSeconds: 120,
          template: {
            metadata: { labels: { existing: "preserved" } },
            spec: {
              restartPolicy: "Never",
              containers: [
                { name: "sidecar", env: [] },
                {
                  name: "report",
                  image: "venue-booking/api:test",
                  env: [
                    { name: "DATABASE_URL", value: "postgres://test" },
                    { name: "REPORT_ID", value: "old" },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  } satisfies V1CronJob
}

describe("scheduledWindow", () => {
  it("rolls forward at midnight in the application time zone", () => {
    expect(
      scheduledWindow(new Date("2026-12-31T15:59:59Z"), "Asia/Shanghai", 7)
    ).toEqual({ from: "2026-12-31", to: "2027-01-06" })
    expect(
      scheduledWindow(new Date("2026-12-31T16:00:00Z"), "Asia/Shanghai", 7)
    ).toEqual({ from: "2027-01-01", to: "2027-01-07" })
  })

  it("uses calendar days across DST and leap days, including a single-day window", () => {
    expect(scheduledWindow(new Date("2028-02-28T12:00:00Z"), "UTC", 3)).toEqual(
      { from: "2028-02-28", to: "2028-03-01" }
    )
    expect(
      scheduledWindow(new Date("2026-11-01T04:30:00Z"), "America/New_York", 2)
    ).toEqual({ from: "2026-11-01", to: "2026-11-02" })
    // 23:30 local on the night before a DST gap at midnight.
    expect(
      scheduledWindow(new Date("2026-03-28T01:30:00Z"), "America/Nuuk", 2)
    ).toEqual({ from: "2026-03-27", to: "2026-03-28" })
    expect(scheduledWindow(new Date("2026-11-12T23:30:00Z"), "UTC", 1)).toEqual(
      { from: "2026-11-12", to: "2026-11-12" }
    )
  })
})

describe("buildReportJob", () => {
  it("copies the template and targets the named report container without owner references", () => {
    const template = cronJob()
    const before = structuredClone(template)
    const job = buildReportJob(template, 42, "venue-report-manual-42-abc12")
    expect(template).toEqual(before)
    expect(job.metadata).toEqual({
      name: "venue-report-manual-42-abc12",
      labels: {
        "app.kubernetes.io/name": "venue-report",
        "venue-booking/report-id": "42",
      },
    })
    expect(job.metadata).not.toHaveProperty("ownerReferences")
    expect(job.metadata).not.toHaveProperty("generateName")
    expect(job.spec).toMatchObject({
      backoffLimit: 0,
      activeDeadlineSeconds: 120,
    })
    expect(job.spec!.template.metadata?.labels).toMatchObject({
      existing: "preserved",
      "venue-booking/report-id": "42",
    })
    expect(job.spec!.template.spec!.containers[0]!.env).toEqual([])
    expect(job.spec!.template.spec!.containers[1]!.env).toEqual([
      { name: "DATABASE_URL", value: "postgres://test" },
      { name: "REPORT_ID", value: "42" },
    ])
  })

  it("creates env when absent and rejects a template without a report container", () => {
    const template = cronJob()
    delete (
      template.spec.jobTemplate.spec.template.spec.containers[1] as {
        env?: unknown
      }
    ).env
    expect(
      buildReportJob(template, 3, "manual-3").spec!.template.spec!
        .containers[1]!.env
    ).toEqual([{ name: "REPORT_ID", value: "3" }])
    template.spec.jobTemplate.spec.template.spec.containers = []
    expect(() => buildReportJob(template, 3, "manual-3")).toThrow(
      "no report container"
    )
  })
})

describe("reportJobFailure", () => {
  it.each<[V1Job, V1JobCondition | undefined]>([
    [{}, undefined],
    [
      { status: { conditions: [{ type: "Failed", status: "False" }] } },
      undefined,
    ],
    [
      { status: { conditions: [{ type: "Failed", status: "True" }] } },
      { type: "Failed", status: "True" },
    ],
    [
      { status: { conditions: [{ type: "Complete", status: "True" }] } },
      undefined,
    ],
    [
      {
        status: {
          conditions: [
            { type: "Complete", status: "True" },
            { type: "Failed", status: "True", reason: "DeadlineExceeded" },
          ],
        },
      },
      { type: "Failed", status: "True", reason: "DeadlineExceeded" },
    ],
  ])("returns only an active Failed condition: %j", (job, expected) => {
    expect(reportJobFailure(structuredClone(job))).toEqual(expected)
  })
})

function fakeBatch() {
  return {
    readNamespacedCronJob: vi.fn<BatchClient["readNamespacedCronJob"]>(),
    createNamespacedJob: vi.fn<BatchClient["createNamespacedJob"]>(),
    readNamespacedJob: vi.fn<BatchClient["readNamespacedJob"]>(),
  }
}

describe("Kubernetes launcher", () => {
  it("creates the Job in the ServiceAccount namespace with bounded requests and accepts an existing Job", async () => {
    const batch = fakeBatch()
    batch.readNamespacedCronJob.mockResolvedValue(cronJob())
    batch.createNamespacedJob.mockRejectedValue(
      new ApiException(409, "", "", {})
    )
    const launcher = createKubernetesLauncher(
      {},
      { batch, namespace: "venue-booking" }
    )
    await launcher.launch(7, "venue-report-manual-7-abc12")
    expect(batch.readNamespacedCronJob.mock.calls[0]![0]).toEqual({
      name: "venue-report",
      namespace: "venue-booking",
    })
    const [create, options] = batch.createNamespacedJob.mock.calls[0]!
    expect(create.namespace).toBe("venue-booking")
    expect(create.body.metadata?.name).toBe("venue-report-manual-7-abc12")
    const request = new RequestContext("https://10.0.0.1", HttpMethod.GET)
    await options!.middleware![0]!.pre(request).toPromise()
    expect(request.getSignal()).toBeInstanceOf(AbortSignal)
  })

  it("returns null for a missing Job and rejects other Kubernetes errors without response details", async () => {
    const batch = fakeBatch()
    batch.readNamespacedJob
      .mockRejectedValueOnce(new ApiException(404, "", "", {}))
      .mockRejectedValueOnce(new ApiException(403, "", "secret token", {}))
    batch.readNamespacedCronJob.mockRejectedValue(
      new ApiException(403, "", "secret token", {})
    )
    const launcher = createKubernetesLauncher({}, { batch, namespace: "test" })
    expect(await launcher.getJob("missing")).toBeNull()
    await expect(launcher.getJob("forbidden")).rejects.toThrow(
      /^Could not read report Job \(HTTP 403\)$/
    )
    await expect(launcher.launch(1, "manual-1")).rejects.toThrow(
      /^Could not read report CronJob \(HTTP 403\)$/
    )
  })

  it("rejects a non-409 Job creation error with its HTTP status and no response details", async () => {
    const batch = fakeBatch()
    batch.readNamespacedCronJob.mockResolvedValue(cronJob())
    batch.createNamespacedJob.mockRejectedValue(
      new ApiException(403, "", "secret token", {})
    )
    const launcher = createKubernetesLauncher({}, { batch, namespace: "test" })
    await expect(launcher.launch(1, "manual-1")).rejects.toThrow(
      /^Could not create report Job \(HTTP 403\)$/
    )
  })

  it("sends every field of the shipped CronJob template through the client's serializer", async () => {
    // Parsed without the client's models, so a field they do not know would show up as a difference.
    const manifest = parse(
      await readFile(
        new URL("../../deploy/k8s/report-cronjob.yaml", import.meta.url),
        "utf8"
      )
    )
    let posted: string | undefined
    const batch = new BatchV1Api(
      createConfiguration({
        baseServer: new ServerConfiguration("https://kubernetes.test", {}),
        httpApi: {
          send(request) {
            const post = request.getHttpMethod() === HttpMethod.POST
            if (post) posted = request.getBody() as string
            const body = Buffer.from(post ? posted! : JSON.stringify(manifest))
            return new Observable(
              Promise.resolve(
                new ResponseContext(
                  post ? 201 : 200,
                  { "content-type": "application/json" },
                  new SelfDecodingBody(Promise.resolve(body))
                )
              )
            )
          },
        },
      })
    )
    await createKubernetesLauncher(
      {},
      { batch, namespace: "venue-booking" }
    ).launch(5, "venue-report-manual-5-abc12")

    const expected = structuredClone(manifest.spec.jobTemplate.spec)
    expected.template.metadata.labels["venue-booking/report-id"] = "5"
    expected.template.spec.containers[0].env.push({
      name: "REPORT_ID",
      value: "5",
    })
    expect(JSON.parse(posted!).spec).toEqual(expected)
  })

  it("fails a call when no namespace is known", async () => {
    const launcher = createKubernetesLauncher({}, { batch: fakeBatch() })
    await expect(launcher.getJob("any")).rejects.toThrow(
      "Kubernetes namespace is unavailable"
    )
  })
})

describe("report configuration and input", () => {
  it("parses the report runtime interface", () => {
    expect(
      loadConfig({
        DATABASE_URL: "postgres://test",
        REPORT_RUNNER: "kubernetes",
        REPORT_WINDOW_DAYS: "7",
        REPORT_ID: "42",
        JOB_NAME: "venue-report-123",
        REPORT_CRONJOB_NAME: "venue-report",
      })
    ).toMatchObject({
      REPORT_RUNNER: "kubernetes",
      REPORT_WINDOW_DAYS: 7,
      REPORT_ID: 42,
      JOB_NAME: "venue-report-123",
      REPORT_CRONJOB_NAME: "venue-report",
    })
  })

  it.each([
    { REPORT_RUNNER: "unknown" },
    { REPORT_WINDOW_DAYS: "0" },
    { REPORT_WINDOW_DAYS: "367" },
    { REPORT_ID: "-1" },
    { JOB_NAME: "INVALID" },
  ])("rejects invalid report config %j", (env) => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://test", ...env })
    ).toThrow("Invalid environment configuration")
  })

  it("caps the inclusive period at 366 days", () => {
    expect(
      CreateReportInputSchema.safeParse({
        from: "2028-01-01",
        to: "2028-12-31",
      }).success
    ).toBe(true)
    for (const range of [
      { from: "2028-01-01", to: "2029-01-01" },
      { from: "2026-11-13", to: "2026-11-12" },
      { from: "2026-02-30", to: "2026-03-01" },
    ])
      expect(CreateReportInputSchema.safeParse(range).success).toBe(false)
  })
})
