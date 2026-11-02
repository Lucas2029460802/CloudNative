import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Reservation } from "@venue/contracts"
import { XIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { describeError, orpc } from "@/lib/api"
import { formatDate } from "@/lib/format"

export function CancelReservationButton({
  reservation,
  size = "default",
}: {
  reservation: Reservation
  size?: "default" | "sm"
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const time = t("common.timeRange", {
    start: reservation.startTime,
    end: reservation.endTime,
  })
  const date = formatDate(reservation.date)

  const cancel = useMutation(
    orpc.reservations.cancel.mutationOptions({
      onSuccess: async () => {
        setOpen(false)
        toast.add({
          type: "success",
          title: t("cancel.done"),
          description: t("cancel.doneBody", {
            venue: reservation.venue.name,
            time,
          }),
        })
        await queryClient.invalidateQueries({
          queryKey: orpc.reservations.key(),
        })
      },
    })
  )

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (cancel.isPending) return
        setOpen(next)
        if (!next) cancel.reset()
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size={size} />}>
        <XIcon data-icon="inline-start" />
        {t("cancel.action")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancel.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("cancel.body", { venue: reservation.venue.name, date, time })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {cancel.isPending && (
          <output className="block text-sm text-muted-foreground">
            {t("cancel.pending")}
          </output>
        )}
        {cancel.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t("cancel.failed")}</AlertTitle>
            <AlertDescription>
              {describeError(cancel.error, t)}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter aria-busy={cancel.isPending}>
          <AlertDialogCancel disabled={cancel.isPending}>
            {t("cancel.keep")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ id: reservation.id })}
          >
            {cancel.isPending && <Spinner data-icon="inline-start" />}
            {t(cancel.isPending ? "cancel.pending" : "cancel.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
