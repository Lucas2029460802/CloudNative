import { createORPCClient, ORPCError } from "@orpc/client"
import type { ContractRouterClient } from "@orpc/contract"
import type { JsonifiedClient } from "@orpc/openapi-client"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { apiErrors, contract } from "@venue/contracts"
import type { TFunction } from "i18next"

// Same origin: Vite (dev) and nginx (Docker) proxy /api to the API service.
const link = new OpenAPILink(contract, { url: `${location.origin}/api` })

export const orpc = createTanstackQueryUtils(
  createORPCClient<JsonifiedClient<ContractRouterClient<typeof contract>>>(link)
)

type ErrorCode = keyof typeof apiErrors | "BAD_REQUEST"

/** Turns an API failure into a sentence for the person using the app. */
export function describeError(error: unknown, t: TFunction): string {
  if (!(error instanceof ORPCError)) return t("errors.network")
  if (error.code === "RESERVATION_CONFLICT") {
    const slots = (
      error.data.conflicts as { startTime: string; endTime: string }[]
    )
      .map(({ startTime, endTime }) =>
        t("common.timeRange", { start: startTime, end: endTime })
      )
      .join(", ")
    return t("errors.RESERVATION_CONFLICT", { slots })
  }
  if (error.code === "BAD_REQUEST" || Object.hasOwn(apiErrors, error.code)) {
    // Error data such as `capacity` fills the message's placeholders.
    return t(`errors.${error.code as ErrorCode}`, error.data)
  }
  return error.status >= 500 ? t("errors.unknown") : error.message
}

export function isNotFound(error: unknown) {
  return error instanceof ORPCError && error.status === 404
}
