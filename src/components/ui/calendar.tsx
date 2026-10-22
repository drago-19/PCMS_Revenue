"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
]

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]

function parseIso(iso?: string): { y: number; m: number; d: number } | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export interface CalendarHighlight {
  date: string
  count?: number
}

export interface CalendarProps {
  selected?: string
  onSelect?: (isoDate: string) => void
  defaultMonthIso?: string
  highlights?: CalendarHighlight[]
  className?: string
}

function Calendar({
  selected,
  onSelect,
  defaultMonthIso,
  highlights = [],
  className,
}: CalendarProps) {
  const highlightMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const item of highlights) {
      map.set(item.date, item.count ?? 1)
    }
    return map
  }, [highlights])

  const initialParts = React.useMemo(() => {
    return (
      parseIso(selected) ??
      parseIso(defaultMonthIso) ??
      parseIso(highlights[0]?.date) ?? {
        y: new Date().getFullYear(),
        m: new Date().getMonth() + 1,
        d: new Date().getDate(),
      }
    )
  }, [selected, defaultMonthIso, highlights])

  const [viewYear, setViewYear] = React.useState(initialParts.y)
  const [viewMonth, setViewMonth] = React.useState(initialParts.m)

  React.useEffect(() => {
    const parsed = parseIso(selected)
    if (parsed) {
      setViewYear(parsed.y)
      setViewMonth(parsed.m)
    }
  }, [selected])

  function prevMonth() {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate()

  const cells: Array<{
    iso: string
    day: number
    inMonth: boolean
  }> = []

  const prevY = viewMonth === 1 ? viewYear - 1 : viewYear
  const prevM = viewMonth === 1 ? 12 : viewMonth - 1
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    cells.push({ iso: toIso(prevY, prevM, d), day: d, inMonth: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: toIso(viewYear, viewMonth, d), day: d, inMonth: true })
  }

  const nextY = viewMonth === 12 ? viewYear + 1 : viewYear
  const nextM = viewMonth === 12 ? 1 : viewMonth + 1
  let trailingDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({
      iso: toIso(nextY, nextM, trailingDay),
      day: trailingDay,
      inMonth: false,
    })
    trailingDay++
  }

  const todayNow = new Date()
  const todayIso = toIso(
    todayNow.getFullYear(),
    todayNow.getMonth() + 1,
    todayNow.getDate()
  )

  return (
    <div data-slot="calendar" className={cn("w-full select-none", className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={prevMonth}
          aria-label="เดือนก่อนหน้า"
          className="size-8 min-h-[32px] min-w-[32px] rounded-lg"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <div className="text-sm font-bold text-foreground">
          {THAI_MONTHS[viewMonth - 1]} {viewYear}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={nextMonth}
          aria-label="เดือนถัดไป"
          className="size-8 min-h-[32px] min-w-[32px] rounded-lg"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {THAI_WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="py-1 text-[11px] font-bold text-muted-foreground"
          >
            {weekday}
          </div>
        ))}

        {cells.map((cell) => {
          const isSelected = selected === cell.iso
          const isToday = todayIso === cell.iso
          const dataCount = highlightMap.get(cell.iso)
          const hasData = Boolean(dataCount && dataCount > 0)

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelect?.(cell.iso)}
              title={
                hasData
                  ? `${cell.iso} (${dataCount?.toLocaleString("th-TH")} บิล)`
                  : cell.iso
              }
              aria-label={`วันที่ ${cell.iso}${hasData ? ` มีข้อมูล ${dataCount} รายการ` : ""}`}
              aria-pressed={isSelected}
              className={cn(
                "relative flex h-9 w-full flex-col items-center justify-center rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                !cell.inMonth && "text-muted-foreground/45",
                cell.inMonth && !isSelected && "text-foreground hover:bg-muted",
                hasData &&
                  !isSelected &&
                  "bg-[#fff0f3] font-bold text-[#be123c] ring-1 ring-[#fecdd3] hover:bg-[#ffe4ea]",
                isToday && !isSelected && "underline underline-offset-2",
                isSelected &&
                  "bg-primary font-extrabold text-primary-foreground shadow-xs hover:bg-[#e01e45]"
              )}
            >
              <span>{cell.day}</span>
              {hasData ? (
                <span
                  className={cn(
                    "mt-0.5 size-1.5 rounded-full",
                    isSelected ? "bg-white" : "bg-[#fe2c55]"
                  )}
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
