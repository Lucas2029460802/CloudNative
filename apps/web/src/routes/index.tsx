import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BuildingIcon, PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { DateRail } from "@/components/date-rail"
import { LoadErrorState } from "@/components/page-states"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { VenueBoard, VenueBoardSkeleton } from "@/features/venues/venue-board"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { orpc } from "@/lib/api"
import { dateSearchSchema } from "@/lib/search"
import { todayISO } from "@/lib/time"

export const Route = createFileRoute("/")({
  validateSearch: dateSearchSchema,
  component: VenueBoardPage,
})

function VenueBoardPage() {
  const { t } = useTranslation()
  const navigate = Route.useNavigate()
  const today = todayISO()
  const date = Route.useSearch().date ?? today
  useDocumentTitle(t("board.title"))

  const venues = useQuery(orpc.venues.list.queryOptions())
  const bookings = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: { date, status: "confirmed" },
    }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-xl flex-col gap-2">
            <h1 className="font-display text-4xl sm:text-5xl">
              {t("board.title")}
            </h1>
            <p className="text-pretty text-muted-foreground">
              {t("board.lead")}
            </p>
          </div>
          <Button
            variant="outline"
            render={<Link to="/venues/new" />}
            nativeButton={false}
          >
            <PlusIcon data-icon="inline-start" />
            {t("board.addVenue")}
          </Button>
        </div>
        <DateRail
          value={date}
          onChange={(next) =>
            void navigate({
              search: { date: next === today ? undefined : next },
              replace: true,
            })
          }
        />
      </section>

      {venues.isPending ? (
        <VenueBoardSkeleton />
      ) : venues.isError ? (
        <LoadErrorState
          error={venues.error}
          onRetry={() => void venues.refetch()}
        />
      ) : venues.data.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BuildingIcon />
            </EmptyMedia>
            <EmptyTitle>{t("board.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("board.emptyBody")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/venues/new" />} nativeButton={false}>
              {t("board.addVenue")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <VenueBoard
          loading={bookings.isPlaceholderData}
          venues={venues.data}
          bookings={bookings.data ?? []}
          date={date}
          today={today}
        />
      )}
    </div>
  )
}
