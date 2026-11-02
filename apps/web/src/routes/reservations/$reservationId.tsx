import { skipToken, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { IdSchema } from "@venue/contracts"
import { ArrowLeftIcon, CircleCheckIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LoadErrorState, NotFoundState } from "@/components/page-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ReservationSlip } from "@/features/reservations/reservation-slip"
import { reservationDetailSearchSchema } from "@/features/reservations/reservation-navigation"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { isNotFound, orpc } from "@/lib/api"

export const Route = createFileRoute("/reservations/$reservationId")({
  validateSearch: reservationDetailSearchSchema,
  component: ReservationPage,
})

function ReservationPage() {
  const { t } = useTranslation()
  const { reservationId } = Route.useParams()
  const { created, back } = Route.useSearch()
  const id = IdSchema.safeParse(reservationId).data

  const reservation = useQuery(
    orpc.reservations.get.queryOptions({
      input: id === undefined ? skipToken : { id },
    })
  )
  useDocumentTitle(t("reservation.number", { id: reservationId }))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 min-h-11 self-start"
        render={<Link to="/reservations" search={back ?? {}} />}
        nativeButton={false}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t(back ? "reservation.backToResults" : "reservation.allReservations")}
      </Button>
      {id === undefined || isNotFound(reservation.error) ? (
        <NotFoundState
          title={t("reservation.notFoundTitle")}
          body={t("reservation.notFoundBody")}
        />
      ) : reservation.isError ? (
        <LoadErrorState
          error={reservation.error}
          onRetry={() => void reservation.refetch()}
        />
      ) : reservation.isPending ? (
        <Skeleton className="h-[30rem]" aria-hidden="true" />
      ) : (
        <>
          {created && reservation.data.status === "confirmed" && (
            <Alert className="animate-in duration-300 fade-in-0 slide-in-from-top-2">
              <CircleCheckIcon />
              <AlertTitle>{t("reservation.confirmedTitle")}</AlertTitle>
              <AlertDescription>
                {t("reservation.confirmedBody", { id: reservation.data.id })}
              </AlertDescription>
            </Alert>
          )}
          <ReservationSlip reservation={reservation.data} />
        </>
      )}
    </div>
  )
}
