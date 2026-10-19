import { createORPCClient, ORPCError } from "@orpc/client"
import type { ContractRouterClient } from "@orpc/contract"
import type { JsonifiedClient } from "@orpc/openapi-client"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { contract } from "@venue/contracts"
import type { TFunction } from "i18next"

// Same-origin by default: Vite (dev) and nginx (Docker) proxy /api to the API service.
const link = new OpenAPILink(contract, {
  url: new URL(
    import.meta.env.VITE_API_BASE_URL ?? "/api",
    window.location.origin
  ).href,
})

const api: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(link)

export const orpc = createTanstackQueryUtils(api)

/** Turns an API failure into a sentence for the person using the app. */
export function describeError(error: unknown, t: TFunction): string {
  if (!(error instanceof ORPCError)) return t("errors.network")

  const data = (error.data ?? {}) as Record<string, unknown>
  switch (error.code) {
    case "RESERVATION_CONFLICT": {
      const conflicts = (data.conflicts ?? []) as {
        startTime: string
        endTime: string
      }[]
      const slots = conflicts
        .map((slot) =>
          t("common.timeRange", { start: slot.startTime, end: slot.endTime })
        )
        .join(", ")
      return t("errors.RESERVATION_CONFLICT", { slots })
    }
    case "OUTSIDE_OPENING_HOURS":
      return t("errors.OUTSIDE_OPENING_HOURS", {
        open: data.openTime,
        close: data.closeTime,
      })
    case "CAPACITY_EXCEEDED":
      return t("errors.CAPACITY_EXCEEDED", { capacity: data.capacity })
    case "RESERVATION_IN_PAST":
      return t("errors.RESERVATION_IN_PAST")
    case "VENUE_DISABLED":
      return t("errors.VENUE_DISABLED")
    case "VENUE_NOT_FOUND":
      return t("errors.VENUE_NOT_FOUND")
    case "RESERVATION_NOT_FOUND":
      return t("errors.RESERVATION_NOT_FOUND")
    case "BAD_REQUEST":
      return t("errors.BAD_REQUEST")
  }
  return error.status >= 500 ? t("errors.unknown") : error.message
}

export function isNotFound(error: unknown) {
  return error instanceof ORPCError && error.status === 404
}
