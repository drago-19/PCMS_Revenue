"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BatchPickerItem {
  batch: number;
  href: string;
  rangeLabel: string;
}

/**
 * ปุ่มเลือกชุดพิมพ์ — เปลี่ยนปุ่มที่เลือกทันทีที่คลิก (Optimistic) พร้อมสปินเนอร์
 * ระหว่างรอ Server เรนเดอร์ใบกำกับฯ ชุดใหม่
 */
export function BatchPicker({
  items,
  currentBatch,
}: {
  items: BatchPickerItem[];
  currentBatch: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeBatch, setActiveBatch] = useOptimistic(currentBatch);

  return (
    <div
      role="group"
      aria-label="เลือกชุดใบกำกับภาษีที่ต้องการพิมพ์"
      aria-busy={isPending}
      className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 sm:flex sm:flex-wrap"
    >
      {items.map((item) => {
        const active = activeBatch === item.batch;
        const loading = isPending && active && item.batch !== currentBatch;
        return (
          <Button
            key={item.batch}
            type="button"
            variant={active ? "default" : "outline"}
            size="xs"
            aria-pressed={active}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onClick={() => {
              if (item.batch === activeBatch) return;
              startTransition(() => {
                setActiveBatch(item.batch);
                router.push(item.href, { scroll: false });
              });
            }}
            className={cn(
              "relative h-auto min-h-10 flex-col items-center justify-center gap-0 px-3 py-1 leading-tight sm:min-w-[96px]",
              active
                ? "shadow-2xs"
                : "bg-white text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]",
            )}
          >
            <span className="inline-flex items-center gap-1 text-xs font-bold">
              {loading ? (<><Loader2Icon className="size-3 animate-spin" aria-hidden /><span className="sr-only">กำลังโหลด</span></>) : null}
              ชุด {item.batch}
            </span>
            <span className={cn("text-[12px]", active ? "opacity-85" : "text-muted-foreground")}>
              {item.rangeLabel}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
