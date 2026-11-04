"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDaysIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar, type CalendarHighlight } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDateLong } from "@/lib/format"
import { notifyNavigationStart } from "@/lib/navigation-progress"
import { cn } from "@/lib/utils"

export interface DatePickerFieldProps {
  name: string
  defaultValue?: string
  placeholder?: string
  availableDates?: CalendarHighlight[]
  basePath?: string
  routePattern?: string
  allowClear?: boolean
  extraParams?: Record<string, string | undefined>
  className?: string
}

const THAI_MONTHS_SHORT = [
  "",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
]

const THAI_MONTHS_FULL = [
  "",
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

function formatYearMonthText(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return ym
  const monthIdx = Number(m[2])
  return `${THAI_MONTHS_SHORT[monthIdx] ?? m[2]} ${m[1]}`
}

export function DatePickerField({
  name,
  defaultValue = "",
  placeholder = "ทุกวันชำระ (เลือกปี/เดือน/วัน)",
  availableDates = [],
  basePath,
  routePattern,
  allowClear = true,
  extraParams,
  className,
}: DatePickerFieldProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue)
  const hiddenInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const isDayValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const isMonthValue = /^\d{4}-\d{2}$/.test(value)
  const isYearValue = /^\d{4}$/.test(value)

  // Allow whole-year filter whenever the picker is not locked to a day/month-only routePattern
  const allowYearSelect = !routePattern

  const { yearsList, monthsMap, availableYearsNumbers, totalAllCount } =
    React.useMemo(() => {
      const yMap = new Map<string, { year: string; days: number; count: number }>()
      const mMap = new Map<string, { ym: string; days: number; count: number }>()
      let sumAll = 0

      for (const item of availableDates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue
        const c = item.count ?? 0
        sumAll += c
        const y = item.date.slice(0, 4)
        const ym = item.date.slice(0, 7)

        const curY = yMap.get(y) ?? { year: y, days: 0, count: 0 }
        curY.days += 1
        curY.count += c
        yMap.set(y, curY)

        const curM = mMap.get(ym) ?? { ym, days: 0, count: 0 }
        curM.days += 1
        curM.count += c
        mMap.set(ym, curM)
      }

      const sortedYears = [...yMap.values()].sort((a, b) =>
        b.year.localeCompare(a.year)
      )
      return {
        yearsList: sortedYears,
        monthsMap: mMap,
        availableYearsNumbers: sortedYears.map((y) => Number(y.year)),
        totalAllCount: sumAll,
      }
    }, [availableDates])

  const defaultYearMonth = React.useMemo(() => {
    if (isDayValue || isMonthValue) {
      return {
        y: Number(value.slice(0, 4)),
        m: Number(value.slice(5, 7)),
      }
    }
    if (isYearValue) {
      const targetYear = value.slice(0, 4)
      const firstInYear = availableDates.find((d) =>
        d.date.startsWith(`${targetYear}-`)
      )
      return {
        y: Number(targetYear),
        m: firstInYear ? Number(firstInYear.date.slice(5, 7)) : 1,
      }
    }
    const latestDate = availableDates[0]?.date
    if (latestDate && /^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
      return {
        y: Number(latestDate.slice(0, 4)),
        m: Number(latestDate.slice(5, 7)),
      }
    }
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1 }
  }, [value, isDayValue, isMonthValue, isYearValue, availableDates])

  const [selectedYear, setSelectedYear] = React.useState<number>(
    defaultYearMonth.y
  )
  const [selectedMonth, setSelectedMonth] = React.useState<number>(
    defaultYearMonth.m
  )
  const [activeTab, setActiveTab] = React.useState<"month" | "day">(
    isDayValue ? "day" : "month"
  )

  // Sync internal view state whenever popover opens or value changes
  React.useEffect(() => {
    if (open) {
      setSelectedYear(defaultYearMonth.y)
      setSelectedMonth(defaultYearMonth.m)
      setActiveTab(isDayValue ? "day" : "month")
    }
  }, [open, defaultYearMonth.y, defaultYearMonth.m, isDayValue])

  function handleYearSwitch(nextYear: number) {
    setSelectedYear(nextYear)
    // Pick the latest month with data in that year so switching to day tab shows an active month
    const prefix = `${String(nextYear).padStart(4, "0")}-`
    const monthInYear = availableDates.find((d) => d.date.startsWith(prefix))
    if (monthInYear) {
      setSelectedMonth(Number(monthInYear.date.slice(5, 7)))
    }
  }

  function applyDate(nextDate: string) {
    setValue(nextDate)
    setOpen(false)

    if (routePattern && nextDate) {
      const targetPath = routePattern.replace(
        "[date]",
        encodeURIComponent(nextDate)
      )
      const search = new URLSearchParams()
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) {
          if (v) search.set(k, v)
        }
      }
      const qs = search.toString()
      notifyNavigationStart()
      router.push(qs ? `${targetPath}?${qs}` : targetPath, { scroll: false })
      return
    }

    if (basePath) {
      const search = new URLSearchParams()
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) {
          if (v) search.set(k, v)
        }
      }
      if (nextDate) {
        search.set(name, nextDate)
      } else {
        search.delete(name)
      }
      const qs = search.toString()
      notifyNavigationStart()
      router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
      return
    }

    requestAnimationFrame(() => {
      hiddenInputRef.current?.form?.requestSubmit()
    })
  }

  const displayLabel = value
    ? isMonthValue
      ? `ทั้งเดือน ${formatYearMonthText(value)}`
      : isYearValue
        ? `ทั้งปี ${value}`
        : formatDateLong(value)
    : placeholder

  const currentYearStr = String(selectedYear).padStart(4, "0")
  const currentYearStats = yearsList.find((y) => y.year === currentYearStr)
  const currentViewYm = `${currentYearStr}-${String(selectedMonth).padStart(2, "0")}`
  const currentMonthStats = monthsMap.get(currentViewYm)

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <input ref={hiddenInputRef} type="hidden" name={name} value={value} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="เลือกวันที่ชำระเงิน"
            className={cn(
              "h-10 min-h-[40px] w-full flex-1 justify-between gap-2 rounded-[10px] border-border bg-white px-3 font-semibold shadow-xs",
              value
                ? "border-primary/50 bg-[#fff0f3]/60 text-foreground"
                : "text-muted-foreground"
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <CalendarIcon
                className={cn(
                  "size-4 shrink-0",
                  value ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="truncate text-[13px]">{displayLabel}</span>
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-[348px] max-w-[calc(100vw-24px)] p-3.5 shadow-lg"
        >
          {/* Header */}
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground">
              เลือกปี · เดือน · วันที่ชำระเงิน
            </span>
            {allowClear && value ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => applyDate("")}
                className="h-7 min-h-[28px] px-2 text-xs font-bold text-primary hover:bg-[#fff0f3]"
              >
                ล้างตัวกรอง
              </Button>
            ) : null}
          </div>

          {/* 1. Year Selector Bar + Whole Year Quick Filter */}
          <div className="mb-3 rounded-xl border border-border bg-[#f8fafc] p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-muted-foreground">
                {yearsList.length > 0
                  ? `ปีที่มีข้อมูล (${yearsList.length} ปี)`
                  : `เลือกปี`}
              </span>
              {allowYearSelect ? (
                <button
                  type="button"
                  onClick={() => applyDate(currentYearStr)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors cursor-pointer",
                    value === currentYearStr
                      ? "bg-primary text-white shadow-2xs"
                      : "bg-[#fff0f3] text-[#be123c] ring-1 ring-[#fecdd3] hover:bg-[#ffe4ea]"
                  )}
                >
                  <CalendarRangeIcon className="size-3" />
                  <span>
                    ดูทั้งปี {currentYearStr}
                    {currentYearStats
                      ? ` (${currentYearStats.count.toLocaleString("th-TH")})`
                      : ""}
                  </span>
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(yearsList.length > 0
                ? yearsList
                : [
                    { year: String(new Date().getFullYear()), days: 0, count: 0 },
                    {
                      year: String(new Date().getFullYear() - 1),
                      days: 0,
                      count: 0,
                    },
                  ]
              ).map((yr) => {
                const yrNum = Number(yr.year)
                const isViewingYear = selectedYear === yrNum
                const isYearFiltered = value === yr.year
                return (
                  <button
                    key={yr.year}
                    type="button"
                    onClick={() => handleYearSwitch(yrNum)}
                    className={cn(
                      "inline-flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
                      isYearFiltered
                        ? "border-primary bg-primary text-white shadow-xs"
                        : isViewingYear
                          ? "border-primary/60 bg-white text-foreground ring-1 ring-primary/25 shadow-2xs"
                          : "border-border bg-white/70 text-muted-foreground hover:border-[#94a3b8] hover:bg-white hover:text-foreground"
                    )}
                  >
                    <span>ปี {yr.year}</span>
                    {yr.count > 0 ? (
                      <span
                        className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          isYearFiltered
                            ? "text-white/90"
                            : isViewingYear
                              ? "text-primary"
                              : "text-muted-foreground"
                        )}
                      >
                        ({yr.count.toLocaleString("th-TH")})
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Mode Switcher Tabs (Month Grid vs Daily Calendar) */}
          <div
            role="tablist"
            aria-label="สลับโหมดเลือกเดือนหรือเลือกวัน"
            className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "month"}
              onClick={() => setActiveTab("month")}
              className={cn(
                "inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer",
                activeTab === "month"
                  ? "bg-white text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGridIcon className="size-3.5 shrink-0" />
              <span>เลือกรายเดือน</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "day"}
              onClick={() => setActiveTab("day")}
              className={cn(
                "inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer",
                activeTab === "day"
                  ? "bg-white text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarDaysIcon className="size-3.5 shrink-0" />
              <span>เลือกวันที่ (ปฏิทิน)</span>
            </button>
          </div>

          {/* 3. Active Mode Content */}
          {activeTab === "month" ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  ตาราง 12 เดือน · ปี {currentYearStr}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  คลิกเดือนเพื่อดูทั้งเดือน
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, idx) => {
                  const mNum = idx + 1
                  const ym = `${currentYearStr}-${String(mNum).padStart(2, "0")}`
                  const mData = monthsMap.get(ym)
                  const hasData = Boolean(mData && mData.count > 0)
                  const canSelectMonth = hasData || availableDates.length === 0
                  const isMonthSelected = value === ym
                  const isDayInMonthSelected =
                    isDayValue && value.startsWith(`${ym}-`)

                  return (
                    <button
                      key={ym}
                      type="button"
                      disabled={!canSelectMonth}
                      onClick={() => applyDate(ym)}
                      title={
                        hasData
                          ? `${THAI_MONTHS_FULL[mNum]} ${currentYearStr} (${mData?.count.toLocaleString("th-TH")} บิล · ${mData?.days} วัน)`
                          : `${THAI_MONTHS_FULL[mNum]} ${currentYearStr} (ไม่มีข้อมูล)`
                      }
                      className={cn(
                        "flex min-h-[54px] flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition-all",
                        !canSelectMonth &&
                          "cursor-not-allowed border-border/60 bg-[#f8fafc]/60 text-muted-foreground/40",
                        canSelectMonth &&
                          !hasData &&
                          !isMonthSelected &&
                          "cursor-pointer border-border bg-[#f8fafc] text-foreground hover:border-[#94a3b8] hover:bg-[#f1f5f9]",
                        hasData &&
                          !isMonthSelected &&
                          "cursor-pointer border-[#fecdd3] bg-[#fff0f3]/65 text-foreground hover:border-primary/50 hover:bg-[#ffe4ea]",
                        isDayInMonthSelected &&
                          !isMonthSelected &&
                          "ring-2 ring-primary/40",
                        isMonthSelected &&
                          "cursor-pointer border-primary bg-primary text-white shadow-xs hover:bg-[#e01e45]"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-bold",
                          isMonthSelected
                            ? "text-white"
                            : canSelectMonth
                              ? "text-foreground"
                              : "text-muted-foreground/45"
                        )}
                      >
                        {THAI_MONTHS_SHORT[mNum]} {currentYearStr.slice(2)}
                      </span>
                      {hasData && mData ? (
                        <span
                          className={cn(
                            "mt-0.5 text-[11px] font-bold tabular-nums",
                            isMonthSelected ? "text-white/95" : "text-[#be123c]"
                          )}
                        >
                          {mData.count.toLocaleString("th-TH")} บิล
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "mt-0.5 text-[10px]",
                            isMonthSelected
                              ? "text-white/80"
                              : "text-muted-foreground/45"
                          )}
                        >
                          ไม่มีข้อมูล
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              {currentMonthStats ? (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-[#fff0f3]/80 px-2.5 py-1.5 ring-1 ring-[#fecdd3]">
                  <span className="text-xs font-bold text-[#9f1239]">
                    {THAI_MONTHS_FULL[selectedMonth]} {selectedYear} (
                    {currentMonthStats.days} วัน)
                  </span>
                  <button
                    type="button"
                    onClick={() => applyDate(currentViewYm)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-bold transition-colors cursor-pointer",
                      value === currentViewYm
                        ? "bg-primary text-white"
                        : "bg-white text-primary ring-1 ring-primary/30 hover:bg-primary hover:text-white"
                    )}
                  >
                    เลือกทั้งเดือน ({currentMonthStats.count.toLocaleString("th-TH")})
                  </button>
                </div>
              ) : null}

              <Calendar
                selected={isDayValue ? value : ""}
                onSelect={(iso) => applyDate(iso)}
                viewYear={selectedYear}
                viewMonth={selectedMonth}
                onViewChange={(nextY, nextM) => {
                  setSelectedYear(nextY)
                  setSelectedMonth(nextM)
                }}
                availableYears={availableYearsNumbers}
                highlights={availableDates}
                showCounts
              />

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>ตัวเลขด้านล่างวันที่ = จำนวนบิลในวันนั้น</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#be123c]">
                  <span className="size-2 rounded-sm bg-[#fff0f3] ring-1 ring-[#fecdd3]" />
                  มีข้อมูลบิล
                </span>
              </div>
            </div>
          )}

          {/* 4. Bottom Action (Show All Days / Clear Filter) */}
          {allowClear ? (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
              <Button
                type="button"
                variant={value === "" ? "default" : "secondary"}
                size="xs"
                onClick={() => applyDate("")}
                className="h-8 min-h-[34px] flex-1 text-xs font-bold"
              >
                แสดงข้อมูลทั้งหมดทุกปี / ทุกวัน
                {totalAllCount > 0
                  ? ` (${totalAllCount.toLocaleString("th-TH")} บิล)`
                  : ""}
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {allowClear && value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => applyDate("")}
          aria-label="ล้างตัวกรองวันที่"
          title="ล้างตัวกรองวันที่ (แสดงทุกวัน)"
          className="size-10 min-h-[40px] min-w-[40px] rounded-[10px] border border-border bg-white text-muted-foreground hover:text-destructive"
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
