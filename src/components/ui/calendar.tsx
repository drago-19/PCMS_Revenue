"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

function formatCompactCount(count: number): string {
  if (count >= 10000) return `${(count / 1000).toFixed(1)}k`
  return count.toLocaleString("th-TH")
}

export interface CalendarHighlight {
  date: string
  count?: number
}

export interface CalendarProps {
  selected?: string
  onSelect?: (isoDate: string) => void
  defaultMonthIso?: string
  viewYear?: number
  viewMonth?: number
  onViewChange?: (year: number, month: number) => void
  availableYears?: number[]
  highlights?: CalendarHighlight[]
  showCounts?: boolean
  className?: string
}

function Calendar({
  selected,
  onSelect,
  defaultMonthIso,
  viewYear: controlledYear,
  viewMonth: controlledMonth,
  onViewChange,
  availableYears,
  highlights = [],
  showCounts = true,
  className,
}: CalendarProps) {
  const { highlightMap, monthTotalsMap, yearTotalsMap } = React.useMemo(() => {
    const map = new Map<string, number>()
    const mMap = new Map<string, number>()
    const yMap = new Map<number, number>()
    for (const item of highlights) {
      const c = item.count ?? 1
      map.set(item.date, c)
      if (/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        const ym = item.date.slice(0, 7)
        const y = Number(item.date.slice(0, 4))
        mMap.set(ym, (mMap.get(ym) ?? 0) + c)
        if (y) yMap.set(y, (yMap.get(y) ?? 0) + c)
      }
    }
    return { highlightMap: map, monthTotalsMap: mMap, yearTotalsMap: yMap }
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

  const [internalYear, setInternalYear] = React.useState(initialParts.y)
  const [internalMonth, setInternalMonth] = React.useState(initialParts.m)

  const viewYear = controlledYear ?? internalYear
  const viewMonth = controlledMonth ?? internalMonth

  const updateView = React.useCallback(
    (nextYear: number, nextMonth: number) => {
      if (controlledYear === undefined) setInternalYear(nextYear)
      if (controlledMonth === undefined) setInternalMonth(nextMonth)
      onViewChange?.(nextYear, nextMonth)
    },
    [controlledYear, controlledMonth, onViewChange]
  )

  React.useEffect(() => {
    const parsed = parseIso(selected)
    if (parsed) {
      setInternalYear(parsed.y)
      setInternalMonth(parsed.m)
    }
  }, [selected])

  const yearOptions = React.useMemo(() => {
    const set = new Set<number>()
    if (availableYears && availableYears.length > 0) {
      for (const y of availableYears) set.add(y)
    }
    for (const item of highlights) {
      const y = Number(item.date.slice(0, 4))
      if (y >= 2000 && y <= 2100) set.add(y)
    }
    set.add(viewYear)
    set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [availableYears, highlights, viewYear])

  function prevMonth() {
    if (viewMonth === 1) {
      updateView(viewYear - 1, 12)
    } else {
      updateView(viewYear, viewMonth - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 12) {
      updateView(viewYear + 1, 1)
    } else {
      updateView(viewYear, viewMonth + 1)
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
      <div className="mb-2.5 flex items-center justify-between gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={prevMonth}
          aria-label="เดือนก่อนหน้า"
          className="size-8 min-h-[32px] min-w-[32px] shrink-0 rounded-lg border-border bg-white hover:border-[#94a3b8] hover:bg-[#f8fafc]"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          {/* Custom shadcn DropdownMenu for Month */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label="เลือกเดือนในปฏิทิน"
                className="h-8 min-h-[32px] min-w-[116px] justify-between gap-1.5 rounded-lg border-border bg-white px-2.5 text-xs font-bold text-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-[#fff0f3]/40 data-[state=open]:border-primary data-[state=open]:bg-[#fff0f3]/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/20"
              >
                <span>{THAI_MONTHS[viewMonth - 1]}</span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 [[data-state=open]>&]:text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              sideOffset={6}
              className="w-[248px] rounded-xl border-border bg-white p-1.5 shadow-xl"
            >
              <div className="mb-1 px-2 py-1 text-[11px] font-bold text-muted-foreground">
                เลือกเดือน · ปี {viewYear}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {THAI_MONTHS.map((label, idx) => {
                  const mNum = idx + 1
                  const active = viewMonth === mNum
                  const ym = `${String(viewYear).padStart(4, "0")}-${String(mNum).padStart(2, "0")}`
                  const mCount = monthTotalsMap.get(ym) ?? 0
                  return (
                    <DropdownMenuItem
                      key={label}
                      onSelect={() => updateView(viewYear, mNum)}
                      className={cn(
                        "flex min-h-[34px] cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors",
                        active
                          ? "bg-primary text-white focus:bg-[#e01e45] focus:text-white"
                          : mCount > 0
                            ? "bg-[#fff0f3]/60 text-foreground hover:bg-[#ffe4ea] focus:bg-[#ffe4ea]"
                            : "text-muted-foreground hover:bg-[#f1f5f9] focus:bg-[#f1f5f9] focus:text-foreground"
                      )}
                    >
                      <span className="truncate">{label}</span>
                      {active ? (
                        <CheckIcon className="size-3.5 shrink-0 text-white" />
                      ) : mCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-white/90 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-[#be123c] ring-1 ring-[#fecdd3]">
                          {formatCompactCount(mCount)}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Custom shadcn DropdownMenu for Year */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label="เลือกปีในปฏิทิน"
                className="h-8 min-h-[32px] min-w-[78px] justify-between gap-1.5 rounded-lg border-border bg-white px-2.5 text-xs font-bold tabular-nums text-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-[#fff0f3]/40 data-[state=open]:border-primary data-[state=open]:bg-[#fff0f3]/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/20"
              >
                <span>{viewYear}</span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 [[data-state=open]>&]:text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              sideOffset={6}
              className="min-w-[148px] rounded-xl border-border bg-white p-1.5 shadow-xl"
            >
              <div className="mb-1 px-2 py-1 text-[11px] font-bold text-muted-foreground">
                เลือกปี พ.ศ./ค.ศ.
              </div>
              <div className="flex flex-col gap-1">
                {yearOptions.map((y) => {
                  const active = viewYear === y
                  const yCount = yearTotalsMap.get(y) ?? 0
                  return (
                    <DropdownMenuItem
                      key={y}
                      onSelect={() => updateView(y, viewMonth)}
                      className={cn(
                        "flex min-h-[34px] cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold tabular-nums transition-colors",
                        active
                          ? "bg-primary text-white focus:bg-[#e01e45] focus:text-white"
                          : yCount > 0
                            ? "bg-[#fff0f3]/60 text-foreground hover:bg-[#ffe4ea] focus:bg-[#ffe4ea]"
                            : "text-muted-foreground hover:bg-[#f1f5f9] focus:bg-[#f1f5f9] focus:text-foreground"
                      )}
                    >
                      <span>ปี {y}</span>
                      {active ? (
                        <CheckIcon className="size-3.5 shrink-0 text-white" />
                      ) : yCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-white/90 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-[#be123c] ring-1 ring-[#fecdd3]">
                          {yCount.toLocaleString("th-TH")}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={nextMonth}
          aria-label="เดือนถัดไป"
          className="size-8 min-h-[32px] min-w-[32px] shrink-0 rounded-lg border-border bg-white hover:border-[#94a3b8] hover:bg-[#f8fafc]"
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
                "relative flex h-10 w-full flex-col items-center justify-center rounded-lg px-0.5 leading-tight transition-colors cursor-pointer",
                !cell.inMonth &&
                  !isSelected &&
                  "text-muted-foreground/35 hover:bg-muted/50",
                cell.inMonth &&
                  !hasData &&
                  !isSelected &&
                  "text-muted-foreground hover:bg-muted",
                cell.inMonth &&
                  hasData &&
                  !isSelected &&
                  "bg-[#fff0f3] text-[#be123c] ring-1 ring-[#fecdd3] hover:bg-[#ffe4ea]",
                isToday && !isSelected && "ring-1 ring-foreground/30",
                isSelected &&
                  "bg-primary text-primary-foreground shadow-xs hover:bg-[#e01e45]"
              )}
            >
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isSelected
                    ? "font-extrabold"
                    : cell.inMonth && hasData
                      ? "font-bold"
                      : "font-semibold"
                )}
              >
                {cell.day}
              </span>
              {hasData ? (
                showCounts && cell.inMonth && typeof dataCount === "number" ? (
                  <span
                    className={cn(
                      "mt-0.5 max-w-full truncate text-[9px] font-bold tabular-nums leading-none",
                      isSelected ? "text-white/95" : "text-[#e11d48]"
                    )}
                  >
                    {formatCompactCount(dataCount)}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "mt-0.5 size-1 rounded-full",
                      isSelected
                        ? "bg-white"
                        : cell.inMonth
                          ? "bg-[#fe2c55]"
                          : "bg-muted-foreground/30"
                    )}
                  />
                )
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
