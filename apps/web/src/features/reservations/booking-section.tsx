import { ORPCError } from "@orpc/client"
import { revalidateLogic, useStore } from "@tanstack/react-form"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CreateReservationInputSchema, type Venue } from "@venue/contracts"
import type { ParseKeys } from "i18next"
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DateRail } from "@/components/date-rail"
import { fieldErrors, useAppForm } from "@/components/form"
import { TimeSelect } from "@/components/time-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { SlotPicker } from "@/features/reservations/slot-picker"
import { useScheduleNow } from "@/hooks/use-minutes-now"
import { describeError, orpc } from "@/lib/api"
import { formatDate, formatDuration } from "@/lib/format"
import {
  daySlots,
  durationMinutes,
  overlaps,
  todayISO,
  toMinutes,
} from "@/lib/time"
import { cn } from "@/lib/utils"

const errorKeys = {
  startTime: "booking.errors.startTime",
  endTime: "booking.errors.endTime",
  bookerName: "booking.errors.bookerName",
  attendeeCount: "booking.errors.attendeeCount",
  purpose: "booking.errors.purpose",
} as const

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 text-sm text-destructive">
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
      />
      {children}
    </p>
  )
}

export function BookingSection({
  venue,
  date,
  onDateChange,
}: {
  venue: Venue
  date: string
  onDateChange: (date: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = useScheduleNow(date, todayISO())
  const slots = daySlots(venue.openTime, venue.closeTime)

  const bookingsQuery = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: { venueId: venue.id, date, status: "confirmed" },
    }),
    placeholderData: keepPreviousData,
  })
  const bookings = bookingsQuery.data ?? []

  const create = useMutation(
    orpc.reservations.create.mutationOptions({
      onSuccess: async (reservation) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.reservations.key(),
        })
        await navigate({
          to: "/reservations/$reservationId",
          params: { reservationId: String(reservation.id) },
          search: { created: true },
        })
      },
      onError: async (error) => {
        // Someone else may have just booked this time: refresh the schedule.
        if (
          error instanceof ORPCError &&
          error.code === "RESERVATION_CONFLICT"
        ) {
          await queryClient.invalidateQueries({
            queryKey: orpc.reservations.key(),
          })
        }
      },
    })
  )

  const form = useAppForm({
    defaultValues: {
      startTime: "",
      endTime: "",
      bookerName: "",
      attendeeCount: Number.NaN,
      purpose: "",
    },
    validationLogic: revalidateLogic(),
    validators: {
      // The API's own schema; capacity is checked here for convenience and again by the API.
      onDynamic: ({ value }) => {
        const fields = fieldErrors(
          CreateReservationInputSchema.safeParse({
            ...value,
            venueId: venue.id,
            date,
          }),
          errorKeys
        )
        if (value.attendeeCount > venue.capacity) {
          fields.attendeeCount ??= "booking.errors.overCapacity"
        }
        return { fields }
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await create.mutateAsync({ ...value, venueId: venue.id, date })
      } catch {
        // The error is rendered from the mutation state below.
      }
    },
  })

  const startTime = useStore(form.store, (state) => state.values.startTime)
  const endTime = useStore(form.store, (state) => state.values.endTime)
  const range = startTime && endTime ? { startTime, endTime } : null
  const validRange = range !== null && startTime < endTime
  const conflict =
    validRange && bookings.some((booking) => overlaps(booking, range))
  const past =
    startTime !== "" && now !== undefined && toMinutes(startTime) <= now

  function setTimes(start: string, end: string) {
    form.setFieldValue("startTime", start)
    form.setFieldValue("endTime", end)
    create.reset()
  }

  function changeDate(next: string) {
    setTimes("", "")
    onDateChange(next)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
      <section
        aria-labelledby="choose-time"
        className="flex min-w-0 flex-col gap-4"
      >
        <h2 id="choose-time" className="font-display text-2xl">
          {t("venue.chooseTime")}
        </h2>
        <DateRail value={date} onChange={changeDate} />
        <div
          aria-busy={bookingsQuery.isPlaceholderData}
          className={cn(
            "transition-opacity",
            bookingsQuery.isPlaceholderData && "opacity-50"
          )}
        >
          <SlotPicker
            key={date}
            openTime={venue.openTime}
            closeTime={venue.closeTime}
            bookings={bookings}
            value={range}
            onChange={(next) => setTimes(next.startTime, next.endTime)}
            now={now}
          />
        </div>
      </section>

      <Card className="lg:sticky lg:top-6">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-(--card-spacing)"
        >
          <CardHeader>
            <CardTitle className="font-display text-xl">
              {t("booking.title")}
            </CardTitle>
            <CardDescription>{formatDate(date, "long")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.Field name="startTime">
                {(startField) => (
                  <form.Field name="endTime">
                    {(endField) => {
                      const timeError = (startField.state.meta.errors[0] ??
                        endField.state.meta.errors[0]) as ParseKeys | undefined
                      return (
                        <div className="flex flex-col gap-3">
                          {validRange ? (
                            <p className="flex flex-wrap items-baseline gap-x-3">
                              <span className="font-display text-3xl tabular-nums">
                                {t("common.timeRange", {
                                  start: startTime,
                                  end: endTime,
                                })}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatDuration(durationMinutes(range))}
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("booking.noSelection")}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <Field data-invalid={!!timeError}>
                              <FieldLabel htmlFor="booking-start">
                                {t("booking.start")}
                              </FieldLabel>
                              <TimeSelect
                                id="booking-start"
                                value={startTime}
                                options={slots.map((slot) => slot.startTime)}
                                invalid={!!timeError}
                                onChange={(next) => {
                                  // Keep the range valid: end with the new start slot if needed.
                                  const slotEnd =
                                    slots.find(
                                      (slot) => slot.startTime === next
                                    )?.endTime ?? ""
                                  setTimes(
                                    next,
                                    endTime > next ? endTime : slotEnd
                                  )
                                }}
                              />
                            </Field>
                            <Field data-invalid={!!timeError}>
                              <FieldLabel htmlFor="booking-end">
                                {t("booking.end")}
                              </FieldLabel>
                              <TimeSelect
                                id="booking-end"
                                value={endTime}
                                options={slots.map((slot) => slot.endTime)}
                                invalid={!!timeError}
                                onChange={(next) => setTimes(startTime, next)}
                              />
                            </Field>
                          </div>
                          {timeError && <FieldError>{t(timeError)}</FieldError>}
                          {conflict && (
                            <Warning>{t("booking.overlapHint")}</Warning>
                          )}
                          {past && <Warning>{t("booking.pastHint")}</Warning>}
                        </div>
                      )
                    }}
                  </form.Field>
                )}
              </form.Field>

              <form.AppField name="bookerName">
                {(field) => (
                  <field.TextField
                    label={t("booking.bookerName")}
                    placeholder={t("booking.bookerNamePlaceholder")}
                    autoComplete="name"
                    maxLength={100}
                  />
                )}
              </form.AppField>
              <form.AppField name="attendeeCount">
                {(field) => (
                  <field.NumberField
                    label={t("booking.attendees")}
                    description={t("common.upToPeople", {
                      count: venue.capacity,
                    })}
                    errorValues={{ capacity: venue.capacity }}
                    min={1}
                    max={venue.capacity}
                  />
                )}
              </form.AppField>
              <form.AppField name="purpose">
                {(field) => (
                  <field.TextareaField
                    label={t("booking.purpose")}
                    placeholder={t("booking.purposePlaceholder")}
                    maxLength={500}
                  />
                )}
              </form.AppField>

              {create.isError && (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>{t("booking.failedTitle")}</AlertTitle>
                  <AlertDescription>
                    {describeError(create.error, t)}
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={create.isPending}
            >
              {create.isPending && <Spinner data-icon="inline-start" />}
              {validRange
                ? t("booking.submit", { start: startTime, end: endTime })
                : t("booking.submitNoTime")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
