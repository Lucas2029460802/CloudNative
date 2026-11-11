import { useQuery } from "@tanstack/react-query"
import type { Report, ReportStatus, VenueUtilisation } from "@venue/contracts"
import i18n from "i18next"
import {
  CheckIcon,
  CircleAlertIcon,
  ClockIcon,
  FileChartColumnIcon,
  XIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { LoadErrorState } from "@/components/page-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { orpc } from "@/lib/api"
import { formatDate, formatDuration, formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

const POLL_MS = 2000
const unfinished = (report: Report) =>
  report.status === "pending" || report.status === "running"

/** The runs list and, beside it, the per-venue result of the selected run. */
export function ReportRuns({
  selectedId,
  onSelect,
}: {
  selectedId?: number
  onSelect: (id: number) => void
}) {
  const { t } = useTranslation()
  // Runs finish elsewhere (a Job), so poll while any of them is still going.
  const reports = useQuery({
    ...orpc.reports.list.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.some(unfinished) ? POLL_MS : false,
  })

  if (!reports.data) {
    return reports.isError ? (
      <LoadErrorState
        error={reports.error}
        onRetry={() => void reports.refetch()}
      />
    ) : (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-6 w-56" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (reports.data.length === 0) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileChartColumnIcon />
          </EmptyMedia>
          <EmptyTitle>{t("reports.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("reports.emptyBody")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const selected =
    reports.data.find((report) => report.id === selectedId) ?? reports.data[0]!

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <ReportDetail report={selected} />
      <section
        aria-labelledby="report-runs-title"
        className="flex flex-col gap-3 lg:order-first"
      >
        <h2 id="report-runs-title" className="font-display text-xl">
          {t("reports.runsTitle")}
        </h2>
        <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-border">
          {reports.data.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                aria-pressed={report.id === selected.id}
                onClick={() => {
                  onSelect(report.id)
                  // On narrow screens the result sits above this list, so bring
                  // it into view and move focus with it.
                  document
                    .getElementById("report-detail-title")
                    ?.focus({ preventScroll: true })
                  document
                    .getElementById("report-detail")
                    ?.scrollIntoView({ block: "nearest" })
                }}
                className={cn(
                  "flex min-h-11 w-full flex-col gap-1 p-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  report.id === selected.id && "bg-muted"
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {t("reports.run", { id: report.id })}
                  </span>
                  <StatusBadge status={report.status} />
                  <span className="text-sm text-muted-foreground">
                    {t(`reports.trigger.${report.trigger}`)}
                  </span>
                </span>
                <span className="text-sm">{rangeLabel(report)}</span>
                <span className="text-xs break-all text-muted-foreground">
                  {t("reports.runner", {
                    name: report.jobName ?? t("reports.inProcess"),
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("reports.requested", {
                    time: formatTimestamp(report.createdAt),
                  })}
                  {" · "}
                  {report.finishedAt
                    ? t("reports.finished", {
                        time: formatTimestamp(report.finishedAt),
                      })
                    : t("reports.unfinished")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function rangeLabel({ from, to }: Report) {
  return i18n.t("reports.range", {
    from: formatDate(from, "short"),
    to: formatDate(to, "short"),
  })
}

const statusIcons = {
  pending: <ClockIcon data-icon="inline-start" />,
  running: <Spinner data-icon="inline-start" />,
  succeeded: <CheckIcon data-icon="inline-start" />,
  failed: <XIcon data-icon="inline-start" />,
}
const statusVariants = {
  pending: "outline",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const

function StatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useTranslation()
  return (
    <Badge variant={statusVariants[status]}>
      {statusIcons[status]}
      {t(`reports.status.${status}`)}
    </Badge>
  )
}

function ReportDetail({ report }: { report: Report }) {
  const { t } = useTranslation()
  return (
    <section
      id="report-detail"
      aria-labelledby="report-detail-title"
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="report-detail-title"
          tabIndex={-1}
          className="font-display text-xl outline-none"
        >
          {t("reports.run", { id: report.id })}
        </h2>
        <StatusBadge status={report.status} />
      </div>
      <p className="text-sm text-muted-foreground">{rangeLabel(report)}</p>
      {/* Announces the run finishing or failing while it is polled. */}
      <p aria-live="polite" className="sr-only">
        {t(`reports.statusMessage.${report.status}`, { id: report.id })}
      </p>
      {report.status === "failed" ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("reports.failedRunTitle")}</AlertTitle>
          <AlertDescription>
            {t("reports.failedRunBody")}
            {report.error && (
              <span className="mt-1 block text-xs break-words text-muted-foreground">
                {report.error}
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : report.results ? (
        <UtilisationTable report={report} results={report.results} />
      ) : (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      )}
    </section>
  )
}

function UtilisationTable({
  report,
  results,
}: {
  report: Report
  results: VenueUtilisation[]
}) {
  const { t } = useTranslation()
  if (results.length === 0) {
    return <p className="text-muted-foreground">{t("reports.noVenues")}</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {t("reports.tableCaption", { range: rangeLabel(report) })}
        </caption>
        <thead>
          <tr className="border-b text-muted-foreground">
            <th scope="col" className="p-3 text-left font-medium">
              {t("reports.venue")}
            </th>
            <th scope="col" className="p-3 text-right font-medium">
              {t("reports.reservations")}
            </th>
            <th scope="col" className="p-3 text-right font-medium">
              {t("reports.bookedTime")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {results.map((row) => (
            <tr key={row.venueId}>
              <th scope="row" className="p-3 text-left font-medium">
                {row.venueName}
              </th>
              <td className="p-3 text-right tabular-nums">
                {row.reservationCount}
              </td>
              <td className="p-3 text-right tabular-nums">
                {formatDuration(row.bookedMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
