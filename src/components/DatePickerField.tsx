"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon, ChevronDownIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, type CalendarHighlight } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate, formatDateLong } from "@/lib/format"
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

function formatYearMonthText(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return ym
  const monthIdx = Number(m[2])
  return `${THAI_MONTHS_SHORT[monthIdx] ?? m[2]} ${m[1]}`
}

export function DatePickerField({
  name,
  defaultValue = "",
  placeholder = "ทุกวันชำระ (เลือกเดือน/วัน)",
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

  const availableMonths = React.useMemo(() => {
    const map = new Map<string, { ym: string; days: number; count: number }>()
    for (const item of availableDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue
      const ym = item.date.slice(0, 7)
      const cur = map.get(ym) ?? { ym, days: 0, count: 0 }
      cur.days += 1
      cur.count += item.count ?? 0
      map.set(ym, cur)
    }
    return [...map.values()].sort((a, b) => b.ym.localeCompare(a.ym))
  }, [availableDates])

  function applyDate(nextDate: string) {
    setValue(nextDate)
    setOpen(false)

    if (routePattern && nextDate) {
      const targetPath = routePattern.replace("[date]", encodeURIComponent(nextDate))
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
    ? /^\d{4}-\d{2}$/.test(value)
      ? `ทั้งเดือน ${formatYearMonthText(value)}`
      : /^\d{4}$/.test(value)
        ? `ทั้งปี ${value}`
        : formatDateLong(value)
    : placeholder

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

        <PopoverContent align="end" className="w-[320px] max-w-[calc(100vw-24px)] p-3">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground">
              เลือกเดือน หรือ วันที่ชำระเงิน
            </span>
            {allowClear && value ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => applyDate("")}
                className="h-7 min-h-[28px] px-2 text-xs text-primary"
              >
                แสดงทุกวัน
              </Button>
            ) : null}
          </div>

          {availableMonths.length > 0 ? (
            <div className="mb-2.5 border-b border-border pb-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">
                  เลือกทั้งเดือน
                </span>
              </div>
              <div className="flex max-h-[88px] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                {availableMonths.map((m) => {
                  const active = value === m.ym
                  return (
                    <button
                      key={m.ym}
                      type="button"
                      onClick={() => applyDate(m.ym)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-white shadow-2xs"
                          : "border-border bg-[#f8fafc] text-foreground hover:border-[#94a3b8] hover:bg-[#f1f5f9]"
                      )}
                    >
                      <span>เดือน {formatYearMonthText(m.ym)}</span>
                      <span
                        className={cn(
                          "text-xs",
                          active ? "text-white/90" : "text-muted-foreground"
                        )}
                      >
                        ({m.count.toLocaleString("th-TH")})
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <Calendar
            selected={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
            onSelect={(iso) => applyDate(iso)}
            defaultMonthIso={
              /^\d{4}-\d{2}/.test(value)
                ? `${value.slice(0, 7)}-01`
                : availableDates[0]?.date
            }
            highlights={availableDates}
          />

          {availableDates.length > 0 ? (
            <div className="mt-3 border-t border-border pt-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">
                  เลือกเฉพาะวัน ({availableDates.length} วัน)
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-[#be123c]">
                  <span className="size-1.5 rounded-full bg-[#fe2c55]" /> มีบิล
                </span>
              </div>
              <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                {availableDates.slice(0, 14).map((item) => {
                  const active = value === item.date
                  return (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => applyDate(item.date)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-[#f8fafc] text-foreground hover:border-[#94a3b8] hover:bg-[#f1f5f9]"
                      )}
                    >
                      <span>{formatDateLong(item.date)}</span>
                      {typeof item.count === "number" ? (
                        <span
                          className={cn(
                            "text-xs",
                            active ? "text-white/90" : "text-muted-foreground"
                          )}
                        >
                          ({item.count.toLocaleString("th-TH")})
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {allowClear ? (
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
              <Button
                type="button"
                variant={value === "" ? "default" : "secondary"}
                size="xs"
                onClick={() => applyDate("")}
                className="h-8 min-h-[32px] flex-1 text-xs"
              >
                แสดงข้อมูลทุกวัน
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
