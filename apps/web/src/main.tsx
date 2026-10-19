import { ORPCError } from "@orpc/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "@/lib/i18n"
import { ThemeProvider } from "@/components/theme-provider"
import { AppToaster } from "@/components/app-toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { routeTree } from "./routeTree.gen"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors such as 404 will not change on retry; network and 5xx errors might.
      retry: (failureCount, error) =>
        !(error instanceof ORPCError && error.status < 500) && failureCount < 2,
    },
  },
})

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((module) => ({
        default: module.ReactQueryDevtools,
      }))
    )
  : () => null

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppToaster>
            <RouterProvider router={router} />
          </AppToaster>
        </TooltipProvider>
        <Suspense>
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
