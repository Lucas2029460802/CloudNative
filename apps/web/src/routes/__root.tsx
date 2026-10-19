import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { AppHeader } from "@/components/app-header"
import { NotFoundState } from "@/components/page-states"
import { Toaster } from "@/components/ui/toast"
import { useDocumentTitle } from "@/hooks/use-document-title"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: PageNotFound,
})

function RootLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        {t("app.skipToContent")}
      </a>
      <AppHeader />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10"
      >
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
          <p>{t("app.footer")}</p>
          <a
            href="/api/docs"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("app.apiDocs")}
          </a>
        </div>
      </footer>
      <Toaster closeLabel={t("common.closeToast")} />
    </div>
  )
}

function PageNotFound() {
  const { t } = useTranslation()
  useDocumentTitle(t("notFound.title"))
  return <NotFoundState title={t("notFound.title")} body={t("notFound.body")} />
}
