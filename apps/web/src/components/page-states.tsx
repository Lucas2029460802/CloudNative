import { Link } from "@tanstack/react-router"
import { CircleAlertIcon, SearchXIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { describeError } from "@/lib/api"

export function NotFoundState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  const { t } = useTranslation()
  return (
    <Empty className="border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>
          <h1>{title}</h1>
        </EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link to="/" />} nativeButton={false}>
          {t("notFound.action")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function LoadErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{t("errors.loadFailed")}</AlertTitle>
      <AlertDescription>{describeError(error, t)}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      </AlertAction>
    </Alert>
  )
}
