import { revalidateLogic, useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CreateVenueInputSchema, type VenueStatus } from "@venue/contracts"
import { CircleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { TimeSelect } from "@/components/time-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { describeError, orpc } from "@/lib/api"
import { fromMinutes } from "@/lib/time"

type VenueValues = {
  name: string
  location: string
  capacity: number
  openTime: string
  closeTime: string
  status: VenueStatus
  description: string
}

const errorKeys = {
  name: "newVenue.errors.name",
  location: "newVenue.errors.location",
  capacity: "newVenue.errors.capacity",
  openTime: "newVenue.errors.openTime",
  closeTime: "newVenue.errors.closeTime",
  description: "newVenue.errors.description",
} as const

type VenueErrorKey = (typeof errorKeys)[keyof typeof errorKeys]

function validateVenue(value: VenueValues) {
  const result = CreateVenueInputSchema.safeParse(value)
  const fields: Partial<Record<keyof VenueValues, VenueErrorKey>> = {}
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path[0]
    if (typeof field === "string" && field in errorKeys) {
      const key = field as keyof typeof errorKeys
      fields[key] ??= errorKeys[key]
    }
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined
}

function errorOf(errors: unknown[]) {
  return errors[0] as VenueErrorKey | undefined
}

// Every half hour of the day; a venue may close as late as 23:59.
const halfHours = Array.from({ length: 48 }, (_, index) =>
  fromMinutes(index * 30)
)
const openingOptions = halfHours
const closingOptions = [...halfHours.slice(1), "23:59"]

/** Creates a venue, then opens its booking page. */
export function VenueForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const create = useMutation(
    orpc.venues.create.mutationOptions({
      onSuccess: async (venue) => {
        await queryClient.invalidateQueries({ queryKey: orpc.venues.key() })
        toast.add({
          type: "success",
          title: t("newVenue.created"),
          description: venue.name,
        })
        await navigate({
          to: "/venues/$venueId",
          params: { venueId: String(venue.id) },
        })
      },
    })
  )

  const form = useForm({
    defaultValues: {
      name: "",
      location: "",
      capacity: Number.NaN,
      openTime: "08:00",
      closeTime: "22:00",
      status: "open",
      description: "",
    } as VenueValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => validateVenue(value) },
    onSubmit: async ({ value }) => {
      try {
        await create.mutateAsync({
          ...value,
          description: value.description || undefined,
        })
      } catch {
        // Rendered from the mutation state.
      }
    },
  })

  return (
    <Card>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-(--card-spacing)"
      >
        <CardContent>
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const error = errorOf(field.state.meta.errors)
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="venue-name">
                      {t("newVenue.name")}
                    </FieldLabel>
                    <Input
                      id="venue-name"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={!!error}
                      placeholder={t("newVenue.namePlaceholder")}
                      maxLength={100}
                    />
                    {error && <FieldError>{t(error)}</FieldError>}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="location">
              {(field) => {
                const error = errorOf(field.state.meta.errors)
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="venue-location">
                      {t("newVenue.location")}
                    </FieldLabel>
                    <Input
                      id="venue-location"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={!!error}
                      placeholder={t("newVenue.locationPlaceholder")}
                      maxLength={200}
                    />
                    {error && <FieldError>{t(error)}</FieldError>}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="capacity">
              {(field) => {
                const error = errorOf(field.state.meta.errors)
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="venue-capacity">
                      {t("newVenue.capacity")}
                    </FieldLabel>
                    <Input
                      id="venue-capacity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={10_000}
                      step={1}
                      value={
                        Number.isNaN(field.state.value) ? "" : field.state.value
                      }
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.valueAsNumber)
                      }
                      aria-invalid={!!error}
                      className="tabular-nums sm:max-w-48"
                    />
                    {error && <FieldError>{t(error)}</FieldError>}
                  </Field>
                )
              }}
            </form.Field>

            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <form.Field name="openTime">
                {(field) => {
                  const error = errorOf(field.state.meta.errors)
                  return (
                    <Field data-invalid={!!error}>
                      <FieldLabel htmlFor="venue-open">
                        {t("newVenue.opens")}
                      </FieldLabel>
                      <TimeSelect
                        id="venue-open"
                        value={field.state.value}
                        options={openingOptions}
                        invalid={!!error}
                        onChange={field.handleChange}
                      />
                      {error && <FieldError>{t(error)}</FieldError>}
                    </Field>
                  )
                }}
              </form.Field>
              <form.Field name="closeTime">
                {(field) => {
                  const error = errorOf(field.state.meta.errors)
                  return (
                    <Field data-invalid={!!error}>
                      <FieldLabel htmlFor="venue-close">
                        {t("newVenue.closes")}
                      </FieldLabel>
                      <TimeSelect
                        id="venue-close"
                        value={field.state.value}
                        options={closingOptions}
                        invalid={!!error}
                        onChange={field.handleChange}
                      />
                      {error && <FieldError>{t(error)}</FieldError>}
                    </Field>
                  )
                }}
              </form.Field>
            </div>

            <form.Field name="status">
              {(field) => (
                <Field>
                  <FieldTitle id="venue-status-label">
                    {t("newVenue.status")}
                  </FieldTitle>
                  <ToggleGroup
                    aria-labelledby="venue-status-label"
                    variant="outline"
                    spacing={0}
                    value={[field.state.value]}
                    onValueChange={([value]) => {
                      if (value === "open" || value === "disabled")
                        field.handleChange(value)
                    }}
                  >
                    <ToggleGroupItem value="open">
                      {t("newVenue.statusOpen")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="disabled">
                      {t("newVenue.statusDisabled")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            </form.Field>

            <form.Field name="description">
              {(field) => {
                const error = errorOf(field.state.meta.errors)
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="venue-description">
                      {t("newVenue.description")}
                    </FieldLabel>
                    <Textarea
                      id="venue-description"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={!!error}
                      placeholder={t("newVenue.descriptionPlaceholder")}
                      rows={3}
                      maxLength={500}
                    />
                    {error ? (
                      <FieldError>{t(error)}</FieldError>
                    ) : (
                      <FieldDescription>
                        {t("newVenue.optional")}
                      </FieldDescription>
                    )}
                  </Field>
                )
              }}
            </form.Field>

            {create.isError && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>{t("newVenue.failedTitle")}</AlertTitle>
                <AlertDescription>
                  {describeError(create.error, t)}
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" size="lg" disabled={create.isPending}>
            {create.isPending && <Spinner data-icon="inline-start" />}
            {t("newVenue.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
