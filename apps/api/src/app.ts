import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { onError, ORPCError, ValidationError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { sql } from "drizzle-orm"
import { Hono } from "hono"

import type { Database } from "./db/client"
import { os } from "./routers/base"
import { reservationsRouter } from "./routers/reservations"
import { venuesRouter } from "./routers/venues"

const router = os.router({
  venues: venuesRouter,
  reservations: reservationsRouter,
})

type AppOptions = {
  db: Database
  timeZone: string
  now?: () => Date
  logRequests?: boolean
}

export function createApp({
  db,
  timeZone,
  now = () => new Date(),
  logRequests = false,
}: AppOptions) {
  const handler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        docsPath: "/docs",
        specPath: "/openapi.json",
        docsTitle: "Venue Booking API",
        specGenerateOptions: {
          info: { title: "Venue Booking API", version: "1.0.0" },
          servers: [{ url: "/api" }],
        },
      }),
    ],
    clientInterceptors: [
      onError((error) => {
        // Reduce schema issues to `{ path, message }` pairs that clients can map to fields.
        if (
          error instanceof ORPCError &&
          error.code === "BAD_REQUEST" &&
          error.cause instanceof ValidationError
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Input validation failed",
            data: {
              issues: error.cause.issues.map((issue) => ({
                path: (issue.path ?? []).map((segment) =>
                  typeof segment === "object" ? segment.key : segment
                ),
                message: issue.message,
              })),
            },
            cause: error.cause,
          })
        }
      }),
    ],
    interceptors: [
      onError((error) => {
        // Expected client errors are part of the API; log only unexpected failures.
        // Clients receive a generic 500 body without stack traces either way.
        if (error instanceof ORPCError && error.status < 500) return
        console.error(error)
      }),
    ],
  })

  const app = new Hono()

  if (logRequests) {
    app.use("/api/*", async (c, next) => {
      const startedAt = performance.now()
      await next()
      if (c.req.path === "/api/health") return
      const duration = Math.round(performance.now() - startedAt)
      console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`)
    })
  }

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ status: "ok", database: "up" })
    } catch {
      return c.json({ status: "unavailable", database: "down" }, 503)
    }
  })

  app.use("/api/*", async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/api",
      context: { db, timeZone, now },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  app.notFound((c) =>
    c.json(
      {
        code: "NOT_FOUND",
        status: 404,
        message: `Route ${c.req.method} ${c.req.path} does not exist`,
      },
      404
    )
  )

  return app
}
