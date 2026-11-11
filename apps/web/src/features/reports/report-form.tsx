import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CreateReportInputSchema } from "@venue/contracts"
import { CircleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { fieldErrors, useAppForm } from "@/components/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { describeError, orpc } from "@/lib/api"
import { focusFirstInvalid } from "@/lib/form-focus"
import { addDaysISO, todayISO } from "@/lib/time"

const errorKeys = {
  from: "reports.errors.from",
  to: "reports.errors.to",
} as const

/** Requests a utilisation report; `onCreated` receives the new report's id. */
export function ReportForm({ onCreated }: { onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const create = useMutation(
    orpc.reports.create.mutationOptions({
      onSuccess: async (report) => {
        // Refresh first so the new run is already in the list when it is selected.
        await queryClient.invalidateQueries({ queryKey: orpc.reports.key() })
        onCreated(report.id)
      },
    })
  )

  const form = useAppForm({
    defaultValues: { from: todayISO(), to: addDaysISO(todayISO(), 6) },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => ({
        fields: fieldErrors(
          CreateReportInputSchema.safeParse(value),
          errorKeys
        ),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await create.mutateAsync(value)
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
          const element = event.currentTarget
          void form.handleSubmit().then(() => focusFirstInvalid(element))
        }}
        className="flex flex-col gap-(--card-spacing)"
      >
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
              <form.AppField name="from">
                {(field) => (
                  <field.TextField
                    type="date"
                    label={t("reports.from")}
                    className="h-11"
                  />
                )}
              </form.AppField>
              <form.AppField name="to">
                {(field) => (
                  <field.TextField
                    type="date"
                    label={t("reports.to")}
                    className="h-11"
                  />
                )}
              </form.AppField>
            </div>

            {create.isError && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>{t("reports.failedTitle")}</AlertTitle>
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
            {t("reports.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
