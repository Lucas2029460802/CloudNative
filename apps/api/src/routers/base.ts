import { implement } from "@orpc/server"
import { contract } from "@venue/contracts"

import type { Database } from "../db/client"
import type { ReportLauncher } from "../reports/launcher"

export type AppContext = {
  db: Database
  /** IANA time zone in which reservation dates and times are interpreted. */
  timeZone: string
  now: () => Date
  reportLauncher?: ReportLauncher
}

export const os = implement(contract).$context<AppContext>()
