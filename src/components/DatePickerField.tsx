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
import { cn } from "@/lib/utils"

export interface DatePickerFieldProps {
  name: string
  defaultValue?: string
  placeholder?: string
  availableDates?: CalendarHighlight[]
  basePath?: string
  extraParams?: Record<string, string | undefined>
  className?: string
}

export function DatePickerField({
  name,
  defaultValue = "",
  placeholder = "ทุกวันชำระ (เลือกวันที่)",
  availableDates = [],
  basePath,
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

  function applyDate(nextDate: string) {
    setValue(nextDate)
    setOpen(false)

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
      router.push(qs ? `${basePath}?${qs}` : basePath)
      return
    }

    requestAnimationFrame(() => {
      hiddenInputRef.current?.form?.requestSubmit()
    })
  }

  const displayLabel = value
    ? `${formatDateLong(value)} (${formatDate(value)})`
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
              "h-10 min-h-[40px] justify-between gap-2 rounded-[10px] border-border bg-white px-3 font-semibold shadow-xs",
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

        <PopoverContent align="end" className="w-[310px] p-3">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground">
              เลือกวันที่ชำระเงิน (Settlement Date)
            </span>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => applyDate("")}
                className="h-7 min-h-[28px] px-2 text-[11.5px] text-primary"
              >
                แสดงทุกวัน
              </Button>
            ) : null}
          </div>

          <Calendar
            selected={value}
            onSelect={(iso) => applyDate(iso)}
            defaultMonthIso={availableDates[0]?.date}
            highlights={availableDates}
          />

          {availableDates.length > 0 ? (
            <div className="mt-3 border-t border-border pt-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground">
                  รอบชำระที่มีข้อมูลในระบบ ({availableDates.length} วัน)
                </span>
                <span className="inline-flex items-center gap-1 text-[10.5px] text-[#be123c]">
                  <span className="size-1.5 rounded-full bg-[#fe2c55]" /> มีบิล
                </span>
              </div>
              <div className="flex max-h-[124px] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                {availableDates.slice(0, 12).map((item) => {
                  const active = value === item.date
                  return (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => applyDate(item.date)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-semibold transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-[#f8fafc] text-foreground hover:border-primary/40 hover:bg-[#fff0f3]"
                      )}
                    >
                      <span>{formatDateLong(item.date)}</span>
                      {typeof item.count === "number" ? (
                        <Badge
                          variant={active ? "glass" : "neutral"}
                          size="sm"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {item.count.toLocaleString("th-TH")}
                        </Badge>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

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
        </PopoverContent>
      </Popover>

      {value ? (
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
