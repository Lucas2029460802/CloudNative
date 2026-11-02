import { Link } from "@tanstack/react-router"
import type { Reservation } from "@venue/contracts"
import { CopyIcon, LinkIcon } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CancelReservationButton } from "@/features/reservations/cancel-reservation-button"
import { formatDate, formatDuration, formatTimestamp } from "@/lib/format"
import { durationMinutes } from "@/lib/time"
import { cn } from "@/lib/utils"

function Detail({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** The confirmation "slip": what was booked, where, when and by whom. */
export function ReservationSlip({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation()
  const cancelled = reservation.status === "cancelled"
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<{
    target: "number" | "link"
    failed: boolean
    value: string
  } | null>(null)
  const manualCopyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!copyResult?.failed) return
    manualCopyRef.current?.focus()
    manualCopyRef.current?.select()
  }, [copyResult])

  async function copy(target: "number" | "link") {
    // Build from the canonical path: created/back query fields belong only to
    // this visit and must never be embedded in a saved reservation link.
    const value =
      target === "number"
        ? String(reservation.id)
        : new URL(`/reservations/${reservation.id}`, location.origin).href
    setCopying(true)
    setCopyResult(null)
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(value)
      setCopyResult({ target, failed: false, value })
    } catch {
      setCopyResult({ target, failed: true, value })
    } finally {
      setCopying(false)
    }
  }

  return (
    <article
      aria-labelledby="slip-title"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-border"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 bg-board px-6 py-4 text-board-foreground">
        <h1 id="slip-title" className="font-display text-xl">
          {t("reservation.number", { id: reservation.id })}
        </h1>
        <Badge variant={cancelled ? "board" : "signal"}>
          {t(`status.${reservation.status}`)}
        </Badge>
      </header>

      <div className="flex flex-col gap-3 border-b px-6 py-4">
        <div className="flex flex-wrap gap-2" aria-busy={copying}>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={copying}
            onClick={() => void copy("number")}
          >
            <CopyIcon aria-hidden="true" data-icon="inline-start" />
            {t("reservation.copyNumber")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={copying}
            onClick={() => void copy("link")}
          >
            <LinkIcon aria-hidden="true" data-icon="inline-start" />
            {t("reservation.copyLink")}
          </Button>
        </div>
        {copyResult && (
          <div className="flex flex-col gap-2">
            <p
              id="copy-status"
              role={copyResult.failed ? "alert" : "status"}
              className={cn(
                "text-sm",
                copyResult.failed ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {copyResult.failed
                ? t("reservation.copyFailed")
                : t(
                    copyResult.target === "number"
                      ? "reservation.copiedNumber"
                      : "reservation.copiedLink"
                  )}
            </p>
            {copyResult.failed && (
              <>
                <Label htmlFor="manual-reservation-copy">
                  {t("reservation.manualCopy")}
                </Label>
                <Input
                  ref={manualCopyRef}
                  id="manual-reservation-copy"
                  readOnly
                  value={copyResult.value}
                  aria-describedby="copy-status"
                  onFocus={(event) => event.target.select()}
                  className="h-11"
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 px-6 pt-6 pb-5">
        <p
          className={cn(
            "font-display text-3xl tabular-nums sm:text-4xl",
            cancelled && "text-muted-foreground line-through decoration-2"
          )}
        >
          {t("common.timeRange", {
            start: reservation.startTime,
            end: reservation.endTime,
          })}
        </p>
        <p className="text-lg">{formatDate(reservation.date, "long")}</p>
        <p className="text-sm text-muted-foreground">
          {formatDuration(durationMinutes(reservation))}
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-5 border-t px-6 py-6 sm:grid-cols-2">
        <Detail label={t("reservation.venue")}>
          <Link
            to="/venues/$venueId"
            params={{ venueId: String(reservation.venueId) }}
            search={{ date: reservation.date }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {reservation.venue.name}
          </Link>
          <span className="block text-sm text-muted-foreground">
            {reservation.venue.location}
          </span>
        </Detail>
        <Detail label={t("reservation.bookedBy")}>
          {reservation.bookerName}
        </Detail>
        <Detail label={t("reservation.attendees")}>
          {t("common.people", { count: reservation.attendeeCount })}
        </Detail>
        <Detail label={t("reservation.createdAt")}>
          {formatTimestamp(reservation.createdAt)}
        </Detail>
        <Detail label={t("reservation.purpose")} wide>
          <span className="whitespace-pre-wrap">{reservation.purpose}</span>
        </Detail>
        {reservation.cancelledAt && (
          <Detail label={t("reservation.cancelledAt")}>
            {formatTimestamp(reservation.cancelledAt)}
          </Detail>
        )}
      </dl>

      <footer className="flex flex-wrap gap-3 border-t bg-muted/50 px-6 py-4 [&_a]:min-h-11 [&_button]:min-h-11">
        {!cancelled && <CancelReservationButton reservation={reservation} />}
        <Button
          variant={cancelled ? "default" : "ghost"}
          render={
            <Link
              to="/venues/$venueId"
              params={{ venueId: String(reservation.venueId) }}
              search={{ date: reservation.date }}
            />
          }
          nativeButton={false}
        >
          {t("reservation.bookAnother")}
        </Button>
      </footer>
    </article>
  )
}
