import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ReportForm } from "@/features/reports/report-form"
import { ReportRuns } from "@/features/reports/report-runs"
import { useDocumentTitle } from "@/hooks/use-document-title"

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
})

function ReportsPage() {
  const { t } = useTranslation()
  // Until a run is picked, the newest one is shown.
  const [selectedId, setSelectedId] = useState<number>()
  useDocumentTitle(t("reports.title"))

  return (
    <div className="flex flex-col gap-7">
      <div className="flex max-w-xl flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {t("reports.eyebrow")}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">
          {t("reports.title")}
        </h1>
        <p className="text-pretty text-muted-foreground">{t("reports.lead")}</p>
      </div>

      <section
        aria-labelledby="report-request-title"
        className="flex flex-col gap-3"
      >
        <h2 id="report-request-title" className="font-display text-xl">
          {t("reports.requestTitle")}
        </h2>
        <ReportForm onCreated={setSelectedId} />
      </section>

      <ReportRuns selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  )
}
