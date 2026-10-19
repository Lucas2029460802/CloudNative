import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { IdSchema } from "@venue/contracts"
import { ArrowLeftIcon, BanIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LoadErrorState, NotFoundState } from "@/components/page-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BookingSection } from "@/features/reservations/booking-section"
import { VenueDisabledBadge, VenueMeta } from "@/features/venues/venue-meta"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { isNotFound, orpc } from "@/lib/api"
import { dateSearchSchema } from "@/lib/search"
import { todayISO } from "@/lib/time"

export const Route = createFileRoute("/venues/$venueId")({
  validateSearch: dateSearchSchema,
  component: VenuePage,
})

function VenuePage() {
  const { t } = useTranslation()
  const navigate = Route.useNavigate()
  const { venueId } = Route.useParams()
  const today = todayISO()
  const date = Route.useSearch().date ?? today
  const id = IdSchema.safeParse(venueId).data

  // Coming from the board, the venue is already in the cached list: show it at once.
  const queryClient = useQueryClient()
  const venue = useQuery({
    ...orpc.venues.get.queryOptions({
      input: id === undefined ? skipToken : { id },
    }),
    placeholderData: () =>
      queryClient
        .getQueryData(orpc.venues.list.queryKey())
        ?.find((candidate) => candidate.id === id),
  })
  useDocumentTitle(venue.data?.name)

  if (id === undefined || isNotFound(venue.error)) {
    return (
      <NotFoundState
        title={t("venue.notFoundTitle")}
        body={t("venue.notFoundBody")}
      />
    )
  }
  if (venue.isError) {
    return (
      <LoadErrorState
        error={venue.error}
        onRetry={() => void venue.refetch()}
      />
    )
  }
  if (venue.isPending) return <VenueSkeleton />

  const disabled = venue.data.status === "disabled"
  const boardDate = date === today ? undefined : date

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start"
          render={<Link to="/" search={{ date: boardDate }} />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("venue.back")}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl sm:text-5xl">
            {venue.data.name}
          </h1>
          {disabled && <VenueDisabledBadge />}
        </div>
        <VenueMeta venue={venue.data} className="text-base" />
        {venue.data.description && (
          <p className="max-w-prose text-pretty text-muted-foreground">
            {venue.data.description}
          </p>
        )}
      </div>

      {disabled ? (
        <Alert className="max-w-2xl">
          <BanIcon />
          <AlertTitle>{t("venue.disabledTitle")}</AlertTitle>
          <AlertDescription>{t("venue.disabledBody")}</AlertDescription>
        </Alert>
      ) : (
        <BookingSection
          venue={venue.data}
          date={date}
          onDateChange={(next) =>
            void navigate({
              search: { date: next === today ? undefined : next },
              replace: true,
            })
          }
        />
      )}
    </div>
  )
}

function VenueSkeleton() {
  return (
    <div className="flex min-h-[80svh] flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-12 w-80 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="h-[28rem]" />
      </div>
    </div>
  )
}
