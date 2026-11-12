"use client";

// ตัวเลือกช่วงวันที่ด้วยปฏิทินของระบบ (ไม่ใช้ปฏิทินของเบราว์เซอร์)
// เลือกแล้วนำทางไป /platform?from=...&to=...[&shop=...] เพื่อให้เซิร์ฟเวอร์คำนวณใหม่

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PeriodPicker({
  from,
  to,
  shop,
}: {
  from?: string;
  to?: string;
  shop?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"from" | "to" | null>(null);

  function go(nextFrom?: string, nextTo?: string) {
    const qs = new URLSearchParams();
    if (shop) qs.set("shop", shop);
    if (nextFrom) qs.set("from", nextFrom);
    if (nextTo) qs.set("to", nextTo);
    router.push(qs.toString() ? `/platform?${qs.toString()}` : "/platform");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open === "from"} onOpenChange={(value) => setOpen(value ? "from" : null)}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label="เลือกวันที่เริ่มต้น">
            จาก: {from ?? "เลือกวันที่"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            selected={from}
            defaultMonthIso={from ?? to}
            onSelect={(isoDate) => {
              setOpen(null);
              go(isoDate, to);
            }}
          />
        </PopoverContent>
      </Popover>

      <span className="text-[12px] text-muted-foreground">ถึง</span>

      <Popover open={open === "to"} onOpenChange={(value) => setOpen(value ? "to" : null)}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label="เลือกวันที่สิ้นสุด">
            ถึง: {to ?? "เลือกวันที่"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            selected={to}
            defaultMonthIso={to ?? from}
            onSelect={(isoDate) => {
              setOpen(null);
              go(from, isoDate);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
