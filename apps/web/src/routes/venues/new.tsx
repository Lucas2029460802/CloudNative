import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { VenueForm } from "@/features/venues/venue-form"
import { useDocumentTitle } from "@/hooks/use-document-title"

export const Route = createFileRoute("/venues/new")({
  component: NewVenuePage,
})

function NewVenuePage() {
  const { t } = useTranslation()
  useDocumentTitle(t("newVenue.title"))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        render={<Link to="/" />}
        nativeButton={false}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("venue.back")}
      </Button>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl sm:text-5xl">
          {t("newVenue.title")}
        </h1>
        <p className="text-muted-foreground">{t("newVenue.lead")}</p>
      </div>
      <VenueForm />
    </div>
  )
}
