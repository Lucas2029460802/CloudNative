import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { IdSchema, ReservationStatusSchema } from "@venue/contracts"
import { ArrowRightIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { LoadErrorState } from "@/components/page-states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  ReservationList,
  ReservationListSkeleton,
} from "@/features/reservations/reservation-list"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { orpc } from "@/lib/api"
import { reservationSearchSchema } from "@/lib/search"
import { todayISO } from "@/lib/time"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/reservations/")({
  validateSearch: reservationSearchSchema,
  component: ReservationsPage,
})

function ReservationsPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const dates = search.dates ?? "upcoming"
  const [reservationNumber, setReservationNumber] = useState("")
  const [numberInvalid, setNumberInvalid] = useState(false)
  const numberRef = useRef<HTMLInputElement>(null)
  useDocumentTitle(t("reservations.title"))

  const reservations = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: {
        q: search.q,
        status: search.status,
        venueId: search.venueId,
        date: search.date,
        from: !search.date && dates === "upcoming" ? todayISO() : undefined,
      },
    }),
    placeholderData: keepPreviousData,
  })
  const venues = useQuery(orpc.venues.list.queryOptions())

  function setSearch(patch: Partial<typeof search>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  }

  const queryRef = useRef<HTMLInputElement>(null)
  const submittedQuery = useRef<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(searchTimer.current), [])
  useEffect(() => {
    // Our own debounced URL update should preserve the exact text being typed,
    // including spaces. Returning to another query restores its saved value.
    const ownUpdate =
      submittedQuery.current !== null &&
      (submittedQuery.current.trim() || undefined) === search.q
    submittedQuery.current = null
    if (ownUpdate) return
    clearTimeout(searchTimer.current)
    if (queryRef.current) queryRef.current.value = search.q ?? ""
  }, [search.q])
  function changeQuery(value: string) {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      submittedQuery.current = value
      setSearch({ q: value.trim() || undefined })
    }, 300)
  }

  function clearFilters() {
    clearTimeout(searchTimer.current)
    submittedQuery.current = null
    if (queryRef.current) queryRef.current.value = ""
    void navigate({ search: {}, replace: true })
  }

  const hasFilters = Boolean(
    search.q || search.status || search.venueId || search.date || search.dates
  )
  const filtered = Boolean(
    search.q || search.status || search.venueId || search.date
  )
  const venueItems = [
    { label: t("reservations.allVenues"), value: null },
    ...(venues.data ?? []).map((venue) => ({
      label: venue.name,
      value: venue.id,
    })),
  ]

  return (
    <div className="flex flex-col gap-7">
      <div className="flex max-w-xl flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {t("reservations.eyebrow")}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">
          {t("reservations.title")}
        </h1>
        <p className="text-pretty text-muted-foreground">
          {t("reservations.lead")}
        </p>
      </div>

      <section
        aria-labelledby="lookup-title"
        className="rounded-xl border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id="lookup-title" className="font-medium">
              {t("reservations.lookupTitle")}
            </h2>
            <p id="lookup-hint" className="text-sm text-muted-foreground">
              {t("reservations.lookupHint")}
            </p>
          </div>
          <form
            noValidate
            className="flex w-full flex-col gap-2 sm:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault()
              const number = reservationNumber.trim()
              const parsed = IdSchema.safeParse(number)
              if (!/^\d+$/.test(number) || !parsed.success) {
                setNumberInvalid(true)
                numberRef.current?.focus()
                return
              }
              void navigate({
                to: "/reservations/$reservationId",
                params: { reservationId: String(parsed.data) },
                search: { back: search },
              })
            }}
          >
            <Label htmlFor="reservation-number">
              {t("reservations.lookupNumber")}
            </Label>
            <div className="flex gap-2">
              <Input
                ref={numberRef}
                id="reservation-number"
                value={reservationNumber}
                onChange={(event) => {
                  setReservationNumber(event.target.value)
                  setNumberInvalid(false)
                }}
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
                placeholder={t("reservations.lookupPlaceholder")}
                aria-invalid={numberInvalid}
                aria-describedby={
                  numberInvalid ? "lookup-error" : "lookup-hint"
                }
                className="h-11 min-w-0 tabular-nums"
              />
              <Button type="submit" className="h-11">
                {t("reservations.lookupAction")}
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            </div>
            {numberInvalid && (
              <p
                id="lookup-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {t("reservations.lookupError")}
              </p>
            )}
          </form>
        </div>
      </section>

      <section
        aria-labelledby="reservation-filters"
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="reservation-filters"
            className="flex items-center gap-2 font-medium"
          >
            <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
            {t("reservations.filters")}
          </h2>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="h-11 sm:h-9"
            >
              {t("reservations.clearFilters")}
            </Button>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_auto]">
          <InputGroup className="h-11">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              ref={queryRef}
              type="search"
              defaultValue={search.q ?? ""}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder={t("reservations.search")}
              aria-label={t("reservations.search")}
              maxLength={100}
            />
          </InputGroup>
          <Select
            items={venueItems}
            value={search.venueId ?? null}
            onValueChange={(venueId) =>
              setSearch({ venueId: venueId ?? undefined })
            }
          >
            <SelectTrigger
              aria-label={t("reservations.venueFilter")}
              className="h-11 w-full lg:min-w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {venueItems.map((item) => (
                  <SelectItem key={item.value ?? "all"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <span
              id="status-filter-label"
              className="text-sm text-muted-foreground"
            >
              {t("reservations.statusFilter")}
            </span>
            <ToggleGroup
              aria-labelledby="status-filter-label"
              variant="outline"
              spacing={0}
              value={[search.status ?? "all"]}
              onValueChange={([value]) => {
                if (value)
                  setSearch({
                    status:
                      value === "all"
                        ? undefined
                        : ReservationStatusSchema.parse(value),
                  })
              }}
            >
              <ToggleGroupItem className="min-h-11" value="all">
                {t("reservations.statusAll")}
              </ToggleGroupItem>
              <ToggleGroupItem className="min-h-11" value="confirmed">
                {t("status.confirmed")}
              </ToggleGroupItem>
              <ToggleGroupItem className="min-h-11" value="cancelled">
                {t("status.cancelled")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-2">
            <span
              id="date-filter-label"
              className="text-sm text-muted-foreground"
            >
              {t("reservations.whenFilter")}
            </span>
            <ToggleGroup
              aria-labelledby="date-filter-label"
              variant="outline"
              spacing={0}
              value={search.date ? [] : [dates]}
              onValueChange={([value]) => {
                if (value)
                  setSearch({
                    dates: value === "all" ? "all" : undefined,
                    date: undefined,
                  })
              }}
            >
              <ToggleGroupItem className="min-h-11" value="upcoming">
                {t("reservations.upcoming")}
              </ToggleGroupItem>
              <ToggleGroupItem className="min-h-11" value="all">
                {t("reservations.allDates")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex min-w-40 flex-col gap-2">
            <Label htmlFor="reservation-date" className="text-muted-foreground">
              {t("reservations.exactDate")}
            </Label>
            <Input
              id="reservation-date"
              type="date"
              value={search.date ?? ""}
              onChange={(event) =>
                setSearch({
                  date: event.target.value || undefined,
                  dates: undefined,
                })
              }
              className="h-11 w-full"
            />
          </div>
        </div>
      </section>

      <section
        aria-label={t("reservations.results")}
        className="flex flex-col gap-3"
      >
        {reservations.isFetching && !reservations.isPending && (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("reservations.updating")}
          </output>
        )}
        <div aria-busy={reservations.isFetching}>
          {reservations.isPending ? (
            <ReservationListSkeleton />
          ) : reservations.isError ? (
            <LoadErrorState
              error={reservations.error}
              onRetry={() => void reservations.refetch()}
            />
          ) : (
            <div
              inert={reservations.isPlaceholderData}
              className={cn(
                "transition-opacity",
                reservations.isPlaceholderData && "opacity-50"
              )}
            >
              <ReservationList
                reservations={reservations.data}
                search={search}
                filtered={filtered}
                refreshing={reservations.isPlaceholderData}
                onClear={clearFilters}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
