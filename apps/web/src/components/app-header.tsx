import { Link, useRouterState } from "@tanstack/react-router"
import { LanguagesIcon, MoonIcon, SunIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { toggleTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8">
      <rect width="32" height="32" rx="7" fill="currentColor" opacity=".12" />
      {[9, 15, 21].map((y) => (
        <rect
          key={y}
          x="6"
          y={y}
          width="20"
          height="3"
          rx="1.5"
          fill="currentColor"
          opacity=".4"
        />
      ))}
      <rect x="11" y="13.5" width="10" height="6" rx="2" fill="var(--signal)" />
    </svg>
  )
}

function NavLink({
  to,
  active,
  children,
}: {
  to: "/" | "/reservations"
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-md px-2.5 py-1.5 text-sm font-medium opacity-75 transition-opacity outline-none hover:opacity-100 focus-visible:ring-3 focus-visible:ring-signal/60",
        // Wayfinding-style marker under the current section.
        "after:absolute after:inset-x-2.5 after:-bottom-[0.6rem] after:h-[3px] after:rounded-full",
        active && "opacity-100 after:bg-signal"
      )}
    >
      {children}
    </Link>
  )
}

function LanguageToggle() {
  const { t, i18n } = useTranslation()
  const next = i18n.resolvedLanguage === "zh-CN" ? "en" : "zh-CN"
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void i18n.changeLanguage(next)}
    >
      <LanguagesIcon data-icon="inline-start" />
      {/* The visible language name starts the accessible name (WCAG 2.5.3). */}
      <span lang={next}>{t("app.language.switchTo")}</span>
      <span className="sr-only">{t("app.language.switchLabel")}</span>
    </Button>
  )
}

function ThemeToggle() {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("app.theme.toggle")}
      onClick={toggleTheme}
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  )
}

export function AppHeader() {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const onReservations = pathname.startsWith("/reservations")

  return (
    <header className="bg-board text-board-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-signal/60"
        >
          <BrandMark />
          <span className="hidden font-display text-xl sm:inline">
            {t("app.name")}
          </span>
        </Link>
        <nav
          aria-label={t("app.nav.label")}
          className="flex items-center gap-0.5"
        >
          <NavLink to="/" active={!onReservations}>
            {t("app.nav.venues")}
          </NavLink>
          <NavLink to="/reservations" active={onReservations}>
            {t("app.nav.reservations")}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-0.5">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
