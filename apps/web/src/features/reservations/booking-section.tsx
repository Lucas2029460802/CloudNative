import { ORPCError } from "@orpc/client"
import { revalidateLogic, useStore } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  CreateReservationInputSchema,
  type Reservation,
  type Venue,
} from "@venue/contracts"
import type { ParseKeys } from "i18next"
import {
  ArrowRightIcon,
  CircleAlertIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
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
import { findAvailableRange } from "@/lib/availability"
import { focusFirstInvalid } from "@/lib/form-focus"
import { formatDate, formatDuration } from "@/lib/format"
import {
  daySlots,
  durationMinutes,
  overlaps,
  todayISO,
  toMinutes,
  type TimeRange,
} from "@/lib/time"

const errorKeys = {
  startTime: "booking.errors.startTime",
  endTime: "booking.errors.endTime",
  bookerName: "booking.errors.bookerName",
  attendeeCount: "booking.errors.attendeeCount",
  purpose: "booking.errors.purpose",
} as const

const EMPTY_BOOKINGS: Reservation[] = []

function Warning({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="flex gap-2 text-sm text-destructive">
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
  initialRange,
  onDateChange,
}: {
  venue: Venue
  date: string
  initialRange?: TimeRange
  onDateChange: (date: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = useScheduleNow(date, todayISO())
  const slots = daySlots(venue.openTime, venue.closeTime)
  const formRef = useRef<HTMLFormElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const appliedRecommendation = useRef<string | null>(null)
  const previousDate = useRef(date)
  const [recommendationExpired, setRecommendationExpired] = useState(false)
  const [formFocused, setFormFocused] = useState(false)

  const bookingsQuery = useQuery({
    ...orpc.reservations.list.queryOptions({
      input: { venueId: venue.id, date, status: "confirmed" },
    }),
  })
  const scheduleReady = bookingsQuery.isSuccess && !bookingsQuery.isFetching
  const bookings = bookingsQuery.isSuccess ? bookingsQuery.data : EMPTY_BOOKINGS

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
  const { isPending: isCreating, reset: resetCreation } = create

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
      if (!scheduleReady || create.isPending) return
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
    scheduleReady &&
    validRange &&
    bookings.some((booking) => overlaps(booking, range))
  const past =
    startTime !== "" && now !== undefined && toMinutes(startTime) <= now
  const wasConflict =
    create.isError &&
    create.error instanceof ORPCError &&
    create.error.code === "RESERVATION_CONFLICT"
  const alternative =
    wasConflict && validRange && scheduleReady
      ? findAvailableRange(
          venue.openTime,
          venue.closeTime,
          bookings,
          durationMinutes(range),
          now,
          startTime
        )
      : null

  // URL navigation (including Back/Forward) changes dates without calling changeDate.
  useEffect(() => {
    if (previousDate.current === date) return
    previousDate.current = date
    appliedRecommendation.current = null
    form.setFieldValue("startTime", "")
    form.setFieldValue("endTime", "")
    setRecommendationExpired(false)
    if (!isCreating) resetCreation()
  }, [date, form, isCreating, resetCreation])

  // A deep-linked suggestion is only applied after this date's actual schedule arrives.
  // Refetches must not overwrite a time the person has subsequently chosen themselves.
  useEffect(() => {
    if (!scheduleReady || !initialRange) return
    const recommendationKey = `${date}:${initialRange.startTime}:${initialRange.endTime}`
    if (appliedRecommendation.current === recommendationKey) return
    appliedRecommendation.current = recommendationKey
    const valid =
      initialRange.startTime < initialRange.endTime &&
      slots.some((slot) => slot.startTime === initialRange.startTime) &&
      slots.some((slot) => slot.endTime === initialRange.endTime) &&
      (now === undefined || toMinutes(initialRange.startTime) > now) &&
      !bookings.some((booking) => overlaps(booking, initialRange))
    setRecommendationExpired(!valid)
    if (valid) {
      form.setFieldValue("startTime", initialRange.startTime)
      form.setFieldValue("endTime", initialRange.endTime)
    } else {
      form.setFieldValue("startTime", "")
      form.setFieldValue("endTime", "")
    }
  }, [bookings, date, form, initialRange, now, scheduleReady, slots])

  useEffect(() => {
    if (create.isError) {
      errorRef.current?.focus({ preventScroll: true })
      errorRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [create.isError])

  function setTimes(start: string, end: string) {
    if (create.isPending) return
    if (initialRange) {
      appliedRecommendation.current = `${date}:${initialRange.startTime}:${initialRange.endTime}`
    }
    form.setFieldValue("startTime", start)
    form.setFieldValue("endTime", end)
    setRecommendationExpired(false)
    create.reset()
  }

  function changeDate(next: string) {
    if (create.isPending) return
    setTimes("", "")
    onDateChange(next)
  }

  function continueToDetails() {
    formRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    })
    formRef.current
      ?.querySelector<HTMLInputElement>("#bookerName")
      ?.focus({ preventScroll: true })
  }

  // A booking can only end after its start, and the slot it ends with must not have started.
  function isEndDisabled(end: string) {
    const slot = slots.find((candidate) => candidate.endTime === end)
    return (
      (startTime !== "" && end <= startTime) ||
      (slot !== undefined &&
        now !== undefined &&
        toMinutes(slot.startTime) <= now)
    )
  }

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:pb-0">
      <section
        aria-labelledby="choose-time"
        className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
      >
        <h2 id="choose-time" className="font-display text-2xl">
          {t("venue.chooseTime")}
        </h2>
        <fieldset disabled={create.isPending} className="min-w-0">
          <DateRail value={date} onChange={changeDate} />
        </fieldset>
        <div aria-busy={bookingsQuery.isFetching}>
          {bookingsQuery.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("booking.scheduleUnavailable")}</AlertTitle>
              <AlertDescription>
                <p>{t("booking.scheduleUnavailableBody")}</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => void bookingsQuery.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : !scheduleReady ? (
            <output className="flex min-h-64 items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 px-5 py-12 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" />
              {t(
                bookingsQuery.data
                  ? "booking.scheduleUpdating"
                  : "booking.scheduleLoading"
              )}
            </output>
          ) : (
            <fieldset disabled={create.isPending} className="min-w-0">
              <SlotPicker
                key={date}
                openTime={venue.openTime}
                closeTime={venue.closeTime}
                bookings={bookings}
                value={range}
                onChange={(next) => setTimes(next.startTime, next.endTime)}
                now={now}
              />
            </fieldset>
          )}
        </div>
      </section>

      <Card className="min-w-0 lg:sticky lg:top-6">
        <form
          ref={formRef}
          id="booking-details"
          onFocusCapture={() => setFormFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setFormFocused(false)
            }
          }}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form
              .handleSubmit()
              .then(() => focusFirstInvalid(formRef.current))
          }}
          className="flex scroll-mt-6 flex-col gap-(--card-spacing)"
        >
          <CardHeader>
            <CardTitle className="font-display text-xl">
              {t("booking.title")}
            </CardTitle>
            <p className="text-sm font-medium">
              <span className="sr-only">{t("booking.summaryVenue")}: </span>
              {venue.name}
            </p>
            <CardDescription>{formatDate(date, "long")}</CardDescription>
            {!scheduleReady && (
              <p className="text-sm text-muted-foreground">
                {t(
                  bookingsQuery.isError
                    ? "booking.scheduleUnavailable"
                    : "booking.scheduleLoading"
                )}
              </p>
            )}
            {recommendationExpired && (
              <output className="block text-sm text-destructive">
                {t("booking.recommendationExpired")}
              </output>
            )}
          </CardHeader>
          <CardContent>
            <fieldset disabled={create.isPending} className="min-w-0">
              <FieldGroup>
                <form.Field name="startTime">
                  {(startField) => (
                    <form.Field name="endTime">
                      {(endField) => {
                        const timeError = (startField.state.meta.errors[0] ??
                          endField.state.meta.errors[0]) as
                          | ParseKeys
                          | undefined
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
                                  describedBy={
                                    [
                                      timeError && "booking-time-error",
                                      conflict && "booking-conflict-hint",
                                      past && "booking-past-hint",
                                    ]
                                      .filter(Boolean)
                                      .join(" ") || undefined
                                  }
                                  isOptionDisabled={(time) =>
                                    now !== undefined && toMinutes(time) <= now
                                  }
                                  onChange={(next) => {
                                    if (
                                      next !== "" &&
                                      now !== undefined &&
                                      toMinutes(next) <= now
                                    ) {
                                      return
                                    }
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
                                  describedBy={
                                    [
                                      timeError && "booking-time-error",
                                      conflict && "booking-conflict-hint",
                                      past && "booking-past-hint",
                                    ]
                                      .filter(Boolean)
                                      .join(" ") || undefined
                                  }
                                  isOptionDisabled={isEndDisabled}
                                  onChange={(next) => setTimes(startTime, next)}
                                />
                              </Field>
                            </div>
                            {timeError && (
                              <FieldError id="booking-time-error">
                                {t(timeError)}
                              </FieldError>
                            )}
                            {conflict && (
                              <Warning id="booking-conflict-hint">
                                {t("booking.overlapHint")}
                              </Warning>
                            )}
                            {past && (
                              <Warning id="booking-past-hint">
                                {t("booking.pastHint")}
                              </Warning>
                            )}
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
                  <Alert ref={errorRef} tabIndex={-1} variant="destructive">
                    <CircleAlertIcon />
                    <AlertTitle>{t("booking.failedTitle")}</AlertTitle>
                    <AlertDescription>
                      {describeError(create.error, t)}
                      {wasConflict && scheduleReady && (
                        <div className="mt-3 border-t pt-3">
                          {alternative ? (
                            <>
                              <p className="font-medium tabular-nums">
                                {t("booking.alternative", {
                                  start: alternative.startTime,
                                  end: alternative.endTime,
                                })}
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                className="mt-2"
                                onClick={() =>
                                  setTimes(
                                    alternative.startTime,
                                    alternative.endTime
                                  )
                                }
                              >
                                {t("booking.useAlternative")}
                              </Button>
                            </>
                          ) : (
                            <p>{t("booking.noAlternative")}</p>
                          )}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </fieldset>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={create.isPending || !scheduleReady}
            >
              {create.isPending && <Spinner data-icon="inline-start" />}
              {validRange
                ? t("booking.submit", { start: startTime, end: endTime })
                : t("booking.submitNoTime")}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {!formFocused && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgb(0_0_0/0.06)] backdrop-blur-sm lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs text-muted-foreground">
                {venue.name} · {formatDate(date)}
              </span>
              <span
                className="text-sm font-semibold tabular-nums"
                aria-live="polite"
              >
                {validRange
                  ? `${t("common.timeRange", { start: startTime, end: endTime })} · ${formatDuration(durationMinutes(range))}`
                  : t("booking.mobileNoSelection")}
              </span>
            </div>
            <Button
              type="button"
              onClick={continueToDetails}
              disabled={!validRange || !scheduleReady || create.isPending}
              aria-controls="booking-details"
              className="min-h-11 shrink-0"
            >
              {t("booking.continue")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
