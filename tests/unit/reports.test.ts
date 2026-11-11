import { describe, expect, it, vi } from "vitest"

import { CreateReportInputSchema } from "../../packages/contracts/src/schemas"
import { loadConfig } from "../../apps/api/src/config"
import {
  buildReportJob,
  createKubernetesLauncher,
  reportJobFailure,
} from "../../apps/api/src/reports/launcher"
import { scheduledWindow } from "../../apps/api/src/reports/run"

function cronJob() {
  return {
    spec: {
      jobTemplate: {
        metadata: { ownerReferences: [{ name: "venue-report" }] },
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
  }
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
    expect(job.spec.template.metadata?.labels).toMatchObject({
      existing: "preserved",
      "venue-booking/report-id": "42",
    })
    expect(job.spec.template.spec.containers[0]!.env).toEqual([])
    expect(job.spec.template.spec.containers[1]!.env).toEqual([
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
      buildReportJob(template, 3, "manual-3").spec.template.spec.containers[1]!
        .env
    ).toEqual([{ name: "REPORT_ID", value: "3" }])
    template.spec.jobTemplate.spec.template.spec.containers = []
    expect(() => buildReportJob(template, 3, "manual-3")).toThrow(
      "no report container"
    )
  })
})

describe("reportJobFailure", () => {
  it.each([
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
  ] as const)(
    "returns only an active Failed condition: %j",
    (job, expected) => {
      expect(reportJobFailure(structuredClone(job))).toEqual(expected)
    }
  )
})

describe("Kubernetes launcher", () => {
  it("uses bounded requests, rereads rotating tokens, and accepts an existing Job", async () => {
    const requests: { url: string; init: RequestInit }[] = []
    const readSecret = vi.fn<(name: string) => Promise<string>>(async (name) =>
      name === "namespace" ? "venue-booking\n" : `token-${requests.length}`
    )
    const request = vi.fn<typeof fetch>(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init: init! })
        return requests.length === 1
          ? Response.json(cronJob())
          : new Response(null, { status: 409 })
      }
    )
    const launcher = createKubernetesLauncher(
      { host: "10.0.0.1" },
      { fetch: request as typeof fetch, readSecret }
    )
    await launcher.launch(7, "venue-report-manual-7-abc12")
    expect(requests.map((item) => item.url)).toEqual([
      "https://10.0.0.1:443/apis/batch/v1/namespaces/venue-booking/cronjobs/venue-report",
      "https://10.0.0.1:443/apis/batch/v1/namespaces/venue-booking/jobs",
    ])
    expect(requests[0]!.init.headers).toHaveProperty(
      "authorization",
      "Bearer token-0"
    )
    expect(requests[1]!.init.headers).toHaveProperty(
      "authorization",
      "Bearer token-1"
    )
    expect(
      requests.every((item) => item.init.signal instanceof AbortSignal)
    ).toBe(true)
    expect(JSON.parse(requests[1]!.init.body as string).metadata.name).toBe(
      "venue-report-manual-7-abc12"
    )
    expect(
      readSecret.mock.calls.filter(([name]) => name === "token")
    ).toHaveLength(2)
  })

  it("returns null for a missing Job and rejects other Kubernetes errors without response details", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("secret token", { status: 403 }))
      .mockResolvedValueOnce(new Response("secret token", { status: 403 }))
    const launcher = createKubernetesLauncher(
      { host: "::1" },
      { fetch: request, readSecret: async () => "test" }
    )
    expect(await launcher.getJob("missing")).toBeNull()
    await expect(launcher.getJob("forbidden")).rejects.toThrow(
      "Could not read report Job (HTTP 403)"
    )
    await expect(launcher.launch(1, "manual-1")).rejects.toThrow(
      "Could not read report CronJob (HTTP 403)"
    )
    expect(request.mock.calls[0]![0]).toContain("https://[::1]:443/")
  })

  it("rejects a non-409 Job creation error with its HTTP status and no response details", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(cronJob()))
      .mockResolvedValueOnce(new Response("secret token", { status: 403 }))
    const launcher = createKubernetesLauncher(
      { host: "10.0.0.1" },
      { fetch: request, readSecret: async () => "test" }
    )
    await expect(launcher.launch(1, "manual-1")).rejects.toThrow(
      "Could not create report Job (HTTP 403)"
    )
    expect(request.mock.calls[1]![1]?.method).toBe("POST")
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
        KUBERNETES_SERVICE_HOST: "10.0.0.1",
        KUBERNETES_SERVICE_PORT: "443",
      })
    ).toMatchObject({
      REPORT_RUNNER: "kubernetes",
      REPORT_WINDOW_DAYS: 7,
      REPORT_ID: 42,
      JOB_NAME: "venue-report-123",
      REPORT_CRONJOB_NAME: "venue-report",
      KUBERNETES_SERVICE_PORT: 443,
    })
  })

  it.each([
    { REPORT_RUNNER: "unknown" },
    { REPORT_WINDOW_DAYS: "0" },
    { REPORT_WINDOW_DAYS: "367" },
    { REPORT_ID: "-1" },
    { JOB_NAME: "INVALID" },
    { KUBERNETES_SERVICE_PORT: "65536" },
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
