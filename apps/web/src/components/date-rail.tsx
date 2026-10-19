import { parseISO, startOfToday } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { enUS, zhCN } from "react-day-picker/locale"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDate } from "@/lib/format"
import { addDaysISO, todayISO, toISODate } from "@/lib/time"

const RAIL_DAYS = 14

/** The next two weeks as one-tap chips, plus a calendar for any later date. */
export function DateRail({
  value,
  onChange,
}: {
  value: string
  onChange: (date: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)
  const today = todayISO()
  const days = Array.from({ length: RAIL_DAYS }, (_, index) =>
    addDaysISO(today, index)
  )
  const isRailDay = days.includes(value)

  // Keep the chosen day visible when it lies beyond the visible chips.
  useEffect(() => {
    const rail = railRef.current
    const chip = rail?.querySelector<HTMLElement>(`[data-date="${value}"]`)
    if (!rail || !chip) return
    const outOfView =
      chip.offsetLeft < rail.scrollLeft ||
      chip.offsetLeft + chip.offsetWidth > rail.scrollLeft + rail.clientWidth
    if (outOfView) {
      rail.scrollTo({
        left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      })
    }
  }, [value])

  function dayName(date: string, index: number) {
    if (index === 0) return t("common.today")
    if (index === 1) return t("common.tomorrow")
    return formatDate(date, "weekday")
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <ToggleGroup
        ref={railRef}
        aria-label={t("common.chooseDate")}
        variant="chip"
        size="chip"
        spacing={1.5}
        value={isRailDay ? [value] : []}
        onValueChange={([date]) => {
          if (date) onChange(date)
        }}
        className="relative w-full min-w-0 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] overflow-x-auto p-0.5 pb-1.5"
      >
        {days.map((date, index) => (
          <ToggleGroupItem
            key={date}
            value={date}
            data-date={date}
            title={formatDate(date, "long")}
          >
            <span className="text-xs font-normal">{dayName(date, index)}</span>
            <span className="font-semibold tabular-nums">
              {formatDate(date, "dayMonth")}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger
          render={
            <Button
              variant={isRailDay ? "outline" : "default"}
              className="shrink-0"
            />
          }
        >
          <CalendarIcon data-icon="inline-start" />
          {isRailDay ? t("common.pickDate") : formatDate(value)}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={parseISO(value)}
            defaultMonth={parseISO(value)}
            onSelect={(date) => {
              if (!date) return
              onChange(toISODate(date))
              setCalendarOpen(false)
            }}
            disabled={{ before: startOfToday() }}
            locale={i18n.resolvedLanguage === "zh-CN" ? zhCN : enUS}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
