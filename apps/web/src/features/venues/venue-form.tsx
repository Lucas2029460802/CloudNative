import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CreateVenueInputSchema, type VenueStatus } from "@venue/contracts"
import { CircleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { fieldErrors, useAppForm } from "@/components/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { describeError, orpc } from "@/lib/api"
import { fromMinutes } from "@/lib/time"

const errorKeys = {
  name: "newVenue.errors.name",
  location: "newVenue.errors.location",
  capacity: "newVenue.errors.capacity",
  openTime: "newVenue.errors.openTime",
  closeTime: "newVenue.errors.closeTime",
  description: "newVenue.errors.description",
} as const

// Every half hour of the day; a venue may close as late as 23:59.
const openingTimes = Array.from({ length: 48 }, (_, index) =>
  fromMinutes(index * 30)
)
const closingTimes = [...openingTimes.slice(1), "23:59"]

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

  const form = useAppForm({
    defaultValues: {
      name: "",
      location: "",
      capacity: Number.NaN,
      openTime: "08:00",
      closeTime: "22:00",
      status: "open" as VenueStatus,
      description: "",
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => ({
        fields: fieldErrors(CreateVenueInputSchema.safeParse(value), errorKeys),
      }),
    },
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
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={t("newVenue.name")}
                  placeholder={t("newVenue.namePlaceholder")}
                  maxLength={100}
                />
              )}
            </form.AppField>
            <form.AppField name="location">
              {(field) => (
                <field.TextField
                  label={t("newVenue.location")}
                  placeholder={t("newVenue.locationPlaceholder")}
                  maxLength={200}
                />
              )}
            </form.AppField>
            <form.AppField name="capacity">
              {(field) => (
                <field.NumberField
                  label={t("newVenue.capacity")}
                  min={1}
                  max={10_000}
                  className="sm:max-w-48"
                />
              )}
            </form.AppField>
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <form.AppField name="openTime">
                {(field) => (
                  <field.TimeField
                    label={t("newVenue.opens")}
                    options={openingTimes}
                  />
                )}
              </form.AppField>
              <form.AppField name="closeTime">
                {(field) => (
                  <field.TimeField
                    label={t("newVenue.closes")}
                    options={closingTimes}
                  />
                )}
              </form.AppField>
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

            <form.AppField name="description">
              {(field) => (
                <field.TextareaField
                  label={t("newVenue.description")}
                  description={t("newVenue.optional")}
                  placeholder={t("newVenue.descriptionPlaceholder")}
                  maxLength={500}
                />
              )}
            </form.AppField>

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
