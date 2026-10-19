import { ORPCError } from "@orpc/client"
import { revalidateLogic, useForm } from "@tanstack/react-form"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CreateReservationInputSchema, type Venue } from "@venue/contracts"
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { DateRail } from "@/components/date-rail"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { SlotPicker } from "@/features/reservations/slot-picker"
import { useScheduleNow } from "@/hooks/use-minutes-now"
import { describeError, orpc } from "@/lib/api"
import { formatDate, formatDuration } from "@/lib/format"
import {
  daySlots,
  durationMinutes,
  fromMinutes,
  overlaps,
  SLOT_MINUTES,
  todayISO,
  toMinutes,
} from "@/lib/time"
import { cn } from "@/lib/utils"

type BookingValues = {
  startTime: string
  endTime: string
  bookerName: string
  attendeeCount: number
  purpose: string
}

const errorKeys = {
  startTime: "booking.errors.startTime",
  endTime: "booking.errors.endTime",
  bookerName: "booking.errors.bookerName",
  attendeeCount: "booking.errors.attendeeCount",
  purpose: "booking.errors.purpose",
} as const

type BookingErrorKey =
  | (typeof errorKeys)[keyof typeof errorKeys]
  | "booking.errors.overCapacity"

/**
 * Validates with the same schema the API uses, then reports one translatable message
 * per field. Capacity is checked here for convenience; the API checks it again.
 */
function validateBooking(value: BookingValues, venue: Venue, date: string) {
  const result = CreateReservationInputSchema.safeParse({
    ...value,
    venueId: venue.id,
    date,
  })
  const fields: Partial<Record<keyof BookingValues, BookingErrorKey>> = {}
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path[0]
    if (typeof field === "string" && field in errorKeys) {
      const key = field as keyof typeof errorKeys
      fields[key] ??= errorKeys[key]
    }
  }
  if (value.attendeeCount > venue.capacity) {
    fields.attendeeCount ??= "booking.errors.overCapacity"
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined
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
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? "en"
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

  const form = useForm({
    defaultValues: {
      startTime: "",
      endTime: "",
      bookerName: "",
      attendeeCount: Number.NaN,
      purpose: "",
    } as BookingValues,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => validateBooking(value, venue, date),
    },
    onSubmit: async ({ value }) => {
      try {
        await create.mutateAsync({ ...value, venueId: venue.id, date })
      } catch {
        // The error is rendered from the mutation state below.
      }
    },
  })

  function setTimes(startTime: string, endTime: string) {
    form.setFieldValue("startTime", startTime)
    form.setFieldValue("endTime", endTime)
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
        <form.Subscribe
          selector={(state) =>
            [state.values.startTime, state.values.endTime] as const
          }
        >
          {([startTime, endTime]) => (
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
                value={startTime && endTime ? { startTime, endTime } : null}
                onChange={(range) => setTimes(range.startTime, range.endTime)}
                now={now}
              />
            </div>
          )}
        </form.Subscribe>
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
            <CardDescription>
              {formatDate(date, language, "long")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.Field name="startTime">
                {(startField) => (
                  <form.Field name="endTime">
                    {(endField) => {
                      const startTime = startField.state.value
                      const endTime = endField.state.value
                      const timeError = (startField.state.meta.errors[0] ??
                        endField.state.meta.errors[0]) as
                        | BookingErrorKey
                        | undefined
                      const range =
                        startTime && endTime ? { startTime, endTime } : null
                      const validRange = range !== null && startTime < endTime
                      const conflict =
                        validRange &&
                        bookings.some((booking) => overlaps(booking, range))
                      const past =
                        startTime !== "" &&
                        now !== undefined &&
                        toMinutes(startTime) <= now
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
                                {formatDuration(durationMinutes(range), t)}
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
                                  // Keep the range valid: move the end after the new start if needed.
                                  const end =
                                    endTime && endTime > next
                                      ? endTime
                                      : (slots.find(
                                          (slot) => slot.startTime === next
                                        )?.endTime ??
                                        fromMinutes(
                                          toMinutes(next) + SLOT_MINUTES
                                        ))
                                  setTimes(next, next ? end : endTime)
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
                            <p className="flex gap-2 text-sm text-destructive">
                              <TriangleAlertIcon
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0"
                              />
                              {t("booking.overlapHint")}
                            </p>
                          )}
                          {past && (
                            <p className="flex gap-2 text-sm text-destructive">
                              <TriangleAlertIcon
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0"
                              />
                              {t("booking.pastHint")}
                            </p>
                          )}
                        </div>
                      )
                    }}
                  </form.Field>
                )}
              </form.Field>

              <form.Field name="bookerName">
                {(field) => {
                  const error = field.state.meta.errors[0] as
                    | BookingErrorKey
                    | undefined
                  return (
                    <Field data-invalid={!!error}>
                      <FieldLabel htmlFor="booking-name">
                        {t("booking.bookerName")}
                      </FieldLabel>
                      <Input
                        id="booking-name"
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={!!error}
                        placeholder={t("booking.bookerNamePlaceholder")}
                        autoComplete="name"
                        maxLength={100}
                      />
                      {error && <FieldError>{t(error)}</FieldError>}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="attendeeCount">
                {(field) => {
                  const error = field.state.meta.errors[0] as
                    | BookingErrorKey
                    | undefined
                  return (
                    <Field data-invalid={!!error}>
                      <FieldLabel htmlFor="booking-attendees">
                        {t("booking.attendees")}
                      </FieldLabel>
                      <Input
                        id="booking-attendees"
                        name={field.name}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={venue.capacity}
                        step={1}
                        value={
                          Number.isNaN(field.state.value)
                            ? ""
                            : field.state.value
                        }
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.valueAsNumber)
                        }
                        aria-invalid={!!error}
                        className="tabular-nums"
                      />
                      {error ? (
                        <FieldError>
                          {t(error, { capacity: venue.capacity })}
                        </FieldError>
                      ) : (
                        <FieldDescription>
                          {t("common.upToPeople", { count: venue.capacity })}
                        </FieldDescription>
                      )}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="purpose">
                {(field) => {
                  const error = field.state.meta.errors[0] as
                    | BookingErrorKey
                    | undefined
                  return (
                    <Field data-invalid={!!error}>
                      <FieldLabel htmlFor="booking-purpose">
                        {t("booking.purpose")}
                      </FieldLabel>
                      <Textarea
                        id="booking-purpose"
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={!!error}
                        placeholder={t("booking.purposePlaceholder")}
                        rows={3}
                        maxLength={500}
                      />
                      {error && <FieldError>{t(error)}</FieldError>}
                    </Field>
                  )
                }}
              </form.Field>

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
            <form.Subscribe
              selector={(state) =>
                [state.values.startTime, state.values.endTime] as const
              }
            >
              {([startTime, endTime]) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={create.isPending}
                >
                  {create.isPending && <Spinner data-icon="inline-start" />}
                  {startTime && endTime && startTime < endTime
                    ? t("booking.submit", { start: startTime, end: endTime })
                    : t("booking.submitNoTime")}
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
