import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ReservationStatusSchema } from "@venue/contracts"
import { SearchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { LoadErrorState } from "@/components/page-states"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
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
import { todayISO } from "@/lib/time"

const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: ReservationStatusSchema.optional().catch(undefined),
  venueId: z.coerce
    .number<number>()
    .int()
    .positive()
    .optional()
    .catch(undefined),
  dates: z.enum(["upcoming", "all"]).optional().catch(undefined),
})

export const Route = createFileRoute("/reservations/")({
  validateSearch: searchSchema,
  component: ReservationsPage,
})

function ReservationsPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const dates = search.dates ?? "upcoming"
  useDocumentTitle(t("reservations.title"))

  const reservations = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: {
        q: search.q,
        status: search.status,
        venueId: search.venueId,
        from: dates === "upcoming" ? todayISO() : undefined,
      },
    }),
    placeholderData: keepPreviousData,
  })
  const venues = useQuery(orpc.venues.list.queryOptions())

  // Typing updates the URL (and the query) once the person pauses for a moment.
  const [query, setQuery] = useState(search.q ?? "")
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  useEffect(() => () => clearTimeout(searchTimer.current), [])
  function changeQuery(value: string) {
    setQuery(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      void navigate({
        search: (prev) => ({ ...prev, q: value.trim() || undefined }),
        replace: true,
      })
    }, 300)
  }

  const venueItems = [
    { label: t("reservations.allVenues"), value: null },
    ...(venues.data ?? []).map((venue) => ({
      label: venue.name,
      value: venue.id,
    })),
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-xl flex-col gap-2">
        <h1 className="font-display text-4xl sm:text-5xl">
          {t("reservations.title")}
        </h1>
        <p className="text-pretty text-muted-foreground">
          {t("reservations.lead")}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <InputGroup className="h-9 lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={t("reservations.search")}
            aria-label={t("reservations.search")}
            maxLength={100}
          />
        </InputGroup>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            aria-label={t("reservations.statusFilter")}
            variant="outline"
            spacing={0}
            value={[search.status ?? "all"]}
            onValueChange={([value]) => {
              if (!value) return
              const status =
                value === "all"
                  ? undefined
                  : ReservationStatusSchema.parse(value)
              void navigate({
                search: (prev) => ({ ...prev, status }),
                replace: true,
              })
            }}
          >
            <ToggleGroupItem value="all">
              {t("reservations.statusAll")}
            </ToggleGroupItem>
            <ToggleGroupItem value="confirmed">
              {t("status.confirmed")}
            </ToggleGroupItem>
            <ToggleGroupItem value="cancelled">
              {t("status.cancelled")}
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            aria-label={t("reservations.whenFilter")}
            variant="outline"
            spacing={0}
            value={[dates]}
            onValueChange={([value]) => {
              if (!value) return
              void navigate({
                search: (prev) => ({
                  ...prev,
                  dates: value === "all" ? "all" : undefined,
                }),
                replace: true,
              })
            }}
          >
            <ToggleGroupItem value="upcoming">
              {t("reservations.upcoming")}
            </ToggleGroupItem>
            <ToggleGroupItem value="all">
              {t("reservations.allDates")}
            </ToggleGroupItem>
          </ToggleGroup>
          <Select
            items={venueItems}
            value={search.venueId ?? null}
            onValueChange={(venueId) =>
              void navigate({
                search: (prev) => ({ ...prev, venueId: venueId ?? undefined }),
                replace: true,
              })
            }
          >
            <SelectTrigger
              aria-label={t("reservations.venueFilter")}
              className="min-w-48"
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
      </div>

      {reservations.isPending ? (
        <ReservationListSkeleton />
      ) : reservations.isError ? (
        <LoadErrorState
          error={reservations.error}
          onRetry={() => void reservations.refetch()}
        />
      ) : (
        <ReservationList reservations={reservations.data} />
      )}
    </div>
  )
}
