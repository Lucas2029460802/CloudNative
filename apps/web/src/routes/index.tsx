import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BuildingIcon,
  CalendarDaysIcon,
  CircleAlertIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { DateRail } from "@/components/date-rail"
import { LoadErrorState } from "@/components/page-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { VenueBoard, type ScheduleState } from "@/features/venues/venue-board"
import { VenueCards, VenueCardsSkeleton } from "@/features/venues/venue-cards"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { orpc } from "@/lib/api"
import { formatDate, formatDuration } from "@/lib/format"
import { boardSearchSchema } from "@/lib/search"
import { todayISO } from "@/lib/time"

export const Route = createFileRoute("/")({
  validateSearch: boardSearchSchema,
  component: VenueBoardPage,
})

function VenueBoardPage() {
  const { t } = useTranslation()
  const navigate = Route.useNavigate()
  const today = todayISO()
  const search = Route.useSearch()
  const date = search.date ?? today
  const duration = search.duration ?? 60
  const view = search.view ?? "cards"
  useDocumentTitle(t("board.title"))

  const venues = useQuery(orpc.venues.list.queryOptions())
  const bookings = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: { date, status: "confirmed" },
    }),
    placeholderData: keepPreviousData,
  })
  const scheduleState: ScheduleState = bookings.isError
    ? "error"
    : bookings.isPending || bookings.isPlaceholderData || bookings.isFetching
      ? "loading"
      : "ready"
  const loadingMessage =
    bookings.isPending || bookings.isPlaceholderData
      ? "board.scheduleLoading"
      : "board.scheduleUpdating"
  const query = (search.q ?? "").trim().toLocaleLowerCase()
  const filtered = (venues.data ?? []).filter(
    (venue) =>
      (!query ||
        `${venue.name} ${venue.location}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (search.people === undefined || venue.capacity >= search.people)
  )
  const hasFilters =
    !!search.q || search.people !== undefined || duration !== 60

  function setSearch(patch: Partial<typeof search>) {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    })
  }
  function clearFilters() {
    setSearch({ q: undefined, people: undefined, duration: undefined })
  }

  return (
    <div className="flex flex-col gap-7 sm:gap-8">
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex max-w-xl flex-col gap-2.5">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <BuildingIcon aria-hidden="true" className="size-4" />
              {t("board.eyebrow")}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl">
              {t("board.title")}
            </h1>
            <p className="text-sm text-pretty text-muted-foreground sm:text-base">
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
        <div className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDaysIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            {formatDate(date, "long")}
          </div>
          <DateRail
            value={date}
            onChange={(next) =>
              setSearch({ date: next === today ? undefined : next })
            }
          />
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_9rem_11rem]">
            <div className="flex min-w-0 flex-col gap-2">
              <label
                htmlFor="venue-search"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("board.searchLabel")}
              </label>
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="venue-search"
                  type="search"
                  value={search.q ?? ""}
                  onChange={(event) =>
                    setSearch({ q: event.target.value || undefined })
                  }
                  placeholder={t("board.searchPlaceholder")}
                  maxLength={100}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="venue-people"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("board.peopleLabel")}
              </label>
              <Input
                id="venue-people"
                type="number"
                inputMode="numeric"
                min={1}
                max={10_000}
                step={1}
                value={search.people ?? ""}
                placeholder={t("board.anyCapacity")}
                onChange={(event) => {
                  const people = event.target.valueAsNumber
                  if (event.target.value === "")
                    setSearch({ people: undefined })
                  else if (
                    Number.isInteger(people) &&
                    people > 0 &&
                    people <= 10_000
                  )
                    setSearch({ people })
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="venue-duration"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("board.durationLabel")}
              </label>
              <select
                id="venue-duration"
                value={duration}
                onChange={(event) => {
                  const next = Number(event.target.value) as 30 | 60 | 120
                  setSearch({ duration: next === 60 ? undefined : next })
                }}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9"
              >
                {[30, 60, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="venue-results"
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="venue-results" className="text-base font-semibold">
              {t("board.resultsTitle")}
            </h2>
            {venues.isSuccess && (
              <output className="text-sm text-muted-foreground">
                {t("board.resultsCount", { count: filtered.length })}
              </output>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t("board.clearFilters")}
              </Button>
            )}
          </div>
          <fieldset className="flex min-w-0 rounded-lg border bg-card p-1">
            <legend className="sr-only">{t("board.viewLabel")}</legend>
            <Button
              variant={view === "cards" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "cards"}
              onClick={() => setSearch({ view: undefined })}
            >
              <LayoutGridIcon data-icon="inline-start" />
              {t("board.cardsView")}
            </Button>
            <Button
              variant={view === "timeline" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "timeline"}
              onClick={() => setSearch({ view: "timeline" })}
            >
              <ListIcon data-icon="inline-start" />
              {t("board.timelineView")}
            </Button>
          </fieldset>
        </div>
        {!venues.isPending &&
          !venues.isError &&
          venues.data.length > 0 &&
          (scheduleState === "error" ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("board.scheduleErrorTitle")}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <p>{t("board.scheduleErrorBody")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void bookings.refetch()}
                  disabled={bookings.isFetching}
                >
                  {bookings.isFetching && <Spinner data-icon="inline-start" />}
                  {t("common.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            scheduleState === "loading" && (
              <output className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t(loadingMessage)}
              </output>
            )
          ))}
        {venues.isPending ? (
          <VenueCardsSkeleton />
        ) : venues.isError ? (
          <LoadErrorState
            error={venues.error}
            onRetry={() => void venues.refetch()}
          />
        ) : venues.data.length === 0 ? (
          <Empty className="border bg-card py-16">
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
        ) : filtered.length === 0 ? (
          <Empty className="border bg-card py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SlidersHorizontalIcon />
              </EmptyMedia>
              <EmptyTitle>{t("board.noResultsTitle")}</EmptyTitle>
              <EmptyDescription>{t("board.noResultsBody")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>
                {t("board.clearFilters")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : view === "timeline" ? (
          <VenueBoard
            venues={filtered}
            bookings={scheduleState === "ready" ? (bookings.data ?? []) : []}
            date={date}
            today={today}
            scheduleState={scheduleState}
            duration={duration}
          />
        ) : (
          <VenueCards
            venues={filtered}
            bookings={scheduleState === "ready" ? (bookings.data ?? []) : []}
            date={date}
            today={today}
            scheduleState={scheduleState}
            duration={duration}
          />
        )}
      </section>
    </div>
  )
}
