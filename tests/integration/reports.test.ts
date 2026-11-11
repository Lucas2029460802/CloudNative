import { hostname } from "node:os"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { reports, reservations } from "../../apps/api/src/db/schema"
import {
  createKubernetesLauncher,
  type ReportJob,
} from "../../apps/api/src/reports/launcher"
import {
  aggregateReport,
  runReport,
  runScheduledReport,
} from "../../apps/api/src/reports/run"
import {
  reservationInput,
  setupTestApi,
  TIME_ZONE,
  TODAY,
  TOMORROW,
} from "./helpers"

const now = new Date("2026-10-19T02:00:00Z")
const range = { from: TODAY, to: TOMORROW }

describe("inline reports", () => {
  const api = setupTestApi({ logRequests: true })

  async function seedBookings() {
    const booking = reservationInput(api.venueIds.hall)
    await api.db.insert(reservations).values([
      { ...booking, date: "2026-10-18" },
      { ...booking, date: TODAY, startTime: "11:00", endTime: "12:30" },
      { ...booking, date: TOMORROW, startTime: "10:00", endTime: "10:45" },
      { ...booking, date: "2026-10-21" },
      {
        ...booking,
        date: TOMORROW,
        startTime: "15:00",
        endTime: "17:00",
        status: "cancelled",
        cancelledAt: now,
      },
    ])
  }

  it("aggregates confirmed bookings within both inclusive bounds and includes every venue", async () => {
    await seedBookings()
    expect(await aggregateReport(api.db, range.from, range.to)).toEqual([
      {
        venueId: api.venueIds.hall,
        venueName: "Test Hall",
        reservationCount: 2,
        bookedMinutes: 135,
      },
      {
        venueId: api.venueIds.studio,
        venueName: "Test Studio",
        reservationCount: 0,
        bookedMinutes: 0,
      },
      {
        venueId: api.venueIds.closed,
        venueName: "Closed Room",
        reservationCount: 0,
        bookedMinutes: 0,
      },
    ])
  })

  it("POST inline returns a completed snapshot and timestamps", async () => {
    await seedBookings()
    const { status, body, headers } = await api.post("/reports", range)
    expect(status).toBe(202)
    expect(headers.get("X-Served-By")).toBe(hostname())
    expect(body).toMatchObject({
      trigger: "manual",
      ...range,
      status: "succeeded",
      jobName: null,
      error: null,
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
    })
    expect(body.results[0]).toMatchObject({
      reservationCount: 2,
      bookedMinutes: 135,
    })
    expect(new Date(body.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(body.finishedAt).getTime()
    )
    expect((await api.get(`/reports/${body.id}`)).body).toEqual(body)
  })

  it("returns zero utilisation without reservations", async () => {
    const { body } = await api.post("/reports", range)
    expect(body.results).toHaveLength(3)
    expect(
      body.results.every(
        (venue: { reservationCount: number; bookedMinutes: number }) =>
          venue.reservationCount === 0 && venue.bookedMinutes === 0
      )
    ).toBe(true)
  })

  it("returns an empty snapshot when there are no venues", async () => {
    await api.db
      .$client`truncate table reservations, venues restart identity cascade`
    expect(await aggregateReport(api.db, range.from, range.to)).toEqual([])
  })

  it("serialises duplicate executions and preserves the completed snapshot", async () => {
    await seedBookings()
    const [row] = await api.db
      .insert(reports)
      .values({ trigger: "manual", ...range, jobName: "manual-1" })
      .returning()
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => runReport(api.db, row!.id, "manual-1"))
    )
    expect(runs.every((run) => run.status === "succeeded")).toBe(true)
    for (const run of runs) expect(run).toEqual(runs[0])
    await api.db.delete(reservations)
    expect(await runReport(api.db, row!.id, "manual-1")).toEqual(runs[0])
    expect((await api.db.select().from(reports))[0]).toEqual(runs[0])
  })

  it("commits running so another connection sees the start before aggregation finishes", async () => {
    const [row] = await api.db
      .insert(reports)
      .values({ trigger: "manual", ...range, jobName: "visible-start" })
      .returning()
    const observer = await api.db.$client.reserve()
    let execution: ReturnType<typeof runReport> | undefined
    let startedAt: Date | undefined
    try {
      await observer`begin`
      // Hold aggregation while this independent connection observes the committed start.
      await observer`lock table reservations in access exclusive mode`
      execution = runReport(api.db, row!.id, "visible-start")
      await expect
        .poll(
          async () => {
            const [running] =
              await observer`select status from reports where id = ${row!.id}`
            return running!.status
          },
          { timeout: 5000 }
        )
        .toBe("running")
      const [running] =
        await observer`select started_at, finished_at, results from reports where id = ${row!.id}`
      expect(running).toMatchObject({
        started_at: expect.any(String),
        finished_at: null,
        results: null,
      })
      startedAt = new Date(running!.started_at)
    } finally {
      await observer`rollback`
      observer.release()
      await execution
    }
    const finished = await execution!
    expect(finished.status).toBe("succeeded")
    expect(finished.startedAt).toEqual(startedAt)
    expect(finished.startedAt!.getTime()).toBeLessThanOrEqual(
      finished.finishedAt!.getTime()
    )
  })

  it.each(["manual", "scheduled"] as const)(
    "ignores a %s worker for a different Job",
    async (trigger) => {
      const [row] = await api.db
        .insert(reports)
        .values({ trigger, ...range, jobName: "correct-job" })
        .returning()
      expect(await runReport(api.db, row!.id, "stale-job")).toMatchObject({
        status: "pending",
        jobName: "correct-job",
        results: null,
      })
    }
  )

  it("upserts one scheduled row, skips a duplicate Job, and refreshes it for a new Job", async () => {
    const options = {
      now,
      timeZone: TIME_ZONE,
      days: 7,
      jobName: "scheduled-1",
    }
    const first = await runScheduledReport(api.db, options)
    await api.post("/reservations", reservationInput(api.venueIds.hall))
    const duplicate = await runScheduledReport(api.db, options)
    expect(duplicate).toEqual(first)
    const oldCreatedAt = new Date(first.createdAt.getTime() - 60_000)
    await api.db
      .$client`update reports set created_at = ${oldCreatedAt.toISOString()} where id = ${first.id}`
    const next = await runScheduledReport(api.db, {
      ...options,
      jobName: "scheduled-2",
    })
    expect(next).toMatchObject({
      id: first.id,
      trigger: "scheduled",
      from: TODAY,
      to: "2026-10-25",
      status: "succeeded",
      jobName: "scheduled-2",
    })
    expect(next.results![0]).toMatchObject({
      reservationCount: 1,
      bookedMinutes: 60,
    })
    expect(next.createdAt.getTime()).toBeGreaterThan(oldCreatedAt.getTime())
    expect(await api.db.$count(reports)).toBe(1)
  })

  it("serialises concurrent scheduled upserts for the same period", async () => {
    const options = {
      now,
      timeZone: TIME_ZONE,
      days: 7,
      jobName: "scheduled-concurrent",
    }
    const runs = await Promise.all([
      runScheduledReport(api.db, options),
      runScheduledReport(api.db, options),
    ])
    expect(runs[0]!.id).toBe(runs[1]!.id)
    expect(runs[0]!.finishedAt).toEqual(runs[1]!.finishedAt)
    expect(await api.db.$count(reports)).toBe(1)
  })

  it("records a sanitised SQL failure inside the locked transaction", async () => {
    const [row] = await api.db
      .insert(reports)
      .values({ trigger: "manual", ...range })
      .returning()
    // A broken relation makes the aggregate fail; restore it before any other test runs.
    await api.db
      .$client`alter table reservations rename to reservations_report_failure_test`
    try {
      const failed = await runReport(api.db, row!.id)
      expect(failed).toMatchObject({
        status: "failed",
        error: "Report generation failed",
        results: null,
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      })
      expect((await api.db.select().from(reports))[0]).toEqual(failed)
      expect(failed.startedAt!.getTime()).toBeLessThanOrEqual(
        failed.finishedAt!.getTime()
      )
    } finally {
      await api.db
        .$client`alter table reservations_report_failure_test rename to reservations`
    }
  })

  it("lists at most 50 reports newest first and returns REPORT_NOT_FOUND", async () => {
    const rows = await api.db
      .insert(reports)
      .values(
        Array.from({ length: 52 }, (_, index) => ({
          trigger: "manual" as const,
          ...range,
          createdAt: new Date(now.getTime() + index * 1000),
        }))
      )
      .returning()
    const { body } = await api.get("/reports")
    expect(body.map((row: { id: number }) => row.id)).toEqual(
      rows
        .slice(2)
        .toReversed()
        .map((row) => row.id)
    )
    const missing = await api.get("/reports/99999")
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe("REPORT_NOT_FOUND")
  })

  it("validates reversed, oversized, and invalid report dates", async () => {
    for (const input of [
      { from: TOMORROW, to: TODAY },
      { from: TODAY, to: "2027-10-20" },
      { from: "invalid", to: TODAY },
    ]) {
      const response = await api.post("/reports", input)
      expect(response.status).toBe(400)
      expect(response.body.code).toBe("BAD_REQUEST")
    }
    expect(await api.db.$count(reports)).toBe(0)
  })

  it("adds the serving instance header to health, validation, and missing routes and logs it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const health = await api.get("/health")
      expect(health.body).toEqual({ status: "ok", database: "up" })
      for (const response of [
        health,
        await api.post("/reports", {}),
        await api.get("/unknown"),
      ]) {
        expect(response.headers.get("X-Served-By")).toBe(hostname())
      }
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`X-Served-By=${hostname()}`)
      )
    } finally {
      log.mockRestore()
    }
  })
})

describe("Kubernetes reports", () => {
  let job: ReportJob | null = {}
  let createStatus = 201
  const request = vi.fn<typeof fetch>()
  const launcher = createKubernetesLauncher(
    { host: "10.0.0.1" },
    {
      fetch: request,
      readSecret: async (name) =>
        name === "namespace" ? "venue-booking" : "test-token",
    }
  )
  const api = setupTestApi({ reportLauncher: launcher })
  const template = {
    spec: {
      jobTemplate: {
        spec: {
          backoffLimit: 0,
          activeDeadlineSeconds: 120,
          template: {
            spec: {
              containers: [{ name: "report", image: "venue-booking/api:test" }],
              restartPolicy: "Never",
            },
          },
        },
      },
    },
  }

  beforeEach(() => {
    job = {}
    createStatus = 201
    request.mockReset().mockImplementation(async (url, init) => {
      if (String(url).includes("/cronjobs/")) return Response.json(template)
      if (init?.method === "POST")
        return new Response(null, { status: createStatus })
      return job ? Response.json(job) : new Response(null, { status: 404 })
    })
  })

  it("persists the Job name before launch and reconciles a failed Job on get", async () => {
    const { status, body } = await api.post("/reports", range)
    expect(status).toBe(202)
    expect(body).toMatchObject({ status: "pending", results: null })
    expect(body.jobName).toMatch(
      new RegExp(`^venue-report-manual-${body.id}-[a-z0-9]{5}$`)
    )
    const posted = JSON.parse(
      request.mock.calls.find(([, init]) => init?.method === "POST")![1]!
        .body as string
    )
    expect(posted.metadata.name).toBe(body.jobName)
    expect(posted.spec.template.spec.containers[0].env).toContainEqual({
      name: "REPORT_ID",
      value: String(body.id),
    })
    job = {
      status: {
        conditions: [
          { type: "Failed", status: "True", reason: "DeadlineExceeded" },
        ],
      },
    }
    const fetched = await api.get(`/reports/${body.id}`)
    expect(fetched.body).toMatchObject({
      status: "failed",
      error: "Report Job failed (DeadlineExceeded)",
      finishedAt: expect.any(String),
    })
  })

  it("treats HTTP 409 when creating the pre-named Job as already launched", async () => {
    createStatus = 409
    const response = await api.post("/reports", range)
    expect(response.status).toBe(202)
    expect(response.body.status).toBe("pending")
    expect((await api.get(`/reports/${response.body.id}`)).body.status).toBe(
      "pending"
    )
  })

  it("marks a launch failure failed and returns a sanitised 503", async () => {
    const error = new Error("postgres://user:password@database secret-token")
    request.mockRejectedValue(error)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = await api.post("/reports", range)
      expect(response.status).toBe(503)
      expect(response.body.code).toBe("REPORT_RUNNER_UNAVAILABLE")
      expect((await api.db.select().from(reports))[0]).toMatchObject({
        status: "failed",
        error: "Report runner is unavailable",
        finishedAt: expect.any(Date),
      })
      expect(JSON.stringify(response.body)).not.toMatch(/password|secret-token/)
      expect(log).toHaveBeenCalledWith(error)
    } finally {
      log.mockRestore()
    }
  })

  it.each([true, false])(
    "recovers an ambiguous Job create only when the Job exists: %s",
    async (exists) => {
      job = exists ? {} : null
      const error = new Error("Job creation connection lost")
      request
        .mockResolvedValueOnce(Response.json(template))
        .mockRejectedValueOnce(error)
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        const response = await api.post("/reports", range)
        expect(response.status).toBe(exists ? 202 : 503)
        const [row] = await api.db.select().from(reports)
        expect(row).toMatchObject({
          status: exists ? "pending" : "failed",
          error: exists ? null : "Report runner is unavailable",
        })
        expect(row!.finishedAt === null).toBe(exists)
        expect(request.mock.calls[2]![0]).toContain(`/jobs/${row!.jobName}`)
        expect(log).toHaveBeenCalledWith(error)
      } finally {
        log.mockRestore()
      }
    }
  )

  it("grants a missing Job 60 seconds, then fails unfinished rows on list", async () => {
    const { body } = await api.post("/reports", range)
    job = null
    await api.db
      .$client`update reports set created_at = ${new Date(now.getTime() - 60_000).toISOString()} where id = ${body.id}`
    expect((await api.get(`/reports/${body.id}`)).body.status).toBe("pending")
    await api.db
      .$client`update reports set created_at = ${new Date(now.getTime() - 60_001).toISOString()} where id = ${body.id}`
    expect((await api.get("/reports")).body[0]).toMatchObject({
      status: "failed",
      error: "Report Job was not found",
    })
  })

  it("also recovers running rows after their Job is deleted", async () => {
    const { body } = await api.post("/reports", range)
    job = null
    await api.db
      .$client`update reports set status = 'running', started_at = ${now.toISOString()}, created_at = ${new Date(now.getTime() - 61_000).toISOString()} where id = ${body.id}`
    expect((await api.get(`/reports/${body.id}`)).body.status).toBe("failed")
  })

  it("keeps a report unfinished during an API outage or a Complete condition without a saved snapshot", async () => {
    const { body } = await api.post("/reports", range)
    job = { status: { conditions: [{ type: "Complete", status: "True" }] } }
    expect((await api.get(`/reports/${body.id}`)).body.status).toBe("pending")
    request.mockRejectedValue(new Error("Kubernetes unavailable"))
    expect((await api.get(`/reports/${body.id}`)).body.status).toBe("pending")
  })

  it("does not overwrite a worker that completes while reconciliation reads the Job", async () => {
    const { body } = await api.post("/reports", range)
    request.mockImplementationOnce(async () => {
      await runReport(api.db, body.id, body.jobName)
      return Response.json({
        status: { conditions: [{ type: "Failed", status: "True" }] },
      })
    })
    expect((await api.get(`/reports/${body.id}`)).body).toMatchObject({
      status: "succeeded",
      error: null,
      results: expect.any(Array),
    })
  })

  it("does not fail a newer scheduled execution after reading an older Job", async () => {
    const [row] = await api.db
      .insert(reports)
      .values({ trigger: "scheduled", ...range, jobName: "old-scheduled" })
      .returning()
    request.mockImplementationOnce(async () => {
      await api.db
        .$client`update reports set job_name = 'new-scheduled' where id = ${row!.id}`
      return Response.json({
        status: { conditions: [{ type: "Failed", status: "True" }] },
      })
    })
    expect((await api.get(`/reports/${row!.id}`)).body).toMatchObject({
      status: "pending",
      jobName: "new-scheduled",
      error: null,
    })
  })
})
