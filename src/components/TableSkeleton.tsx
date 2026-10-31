"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

let lastMeasuredTableHeight = 560;

/**
 * skeleton เฉพาะ "ส่วนตาราง" — ใช้แทนข้อมูลเดิมระหว่างรอ server ตอบ
 * แถบตัวกรอง/หัวข้อที่เรนเดอร์ไว้แล้วจะไม่ถูกแทนที่ ทำให้กดตัวกรองซ้ำได้ทันที
 */
const tableSkeletonVariants = cva("flex w-full min-w-0 flex-col", {
  variants: {
    density: {
      relaxed: "min-h-[560px]",
      compact: "min-h-[240px]",
    },
  },
  defaultVariants: { density: "relaxed" },
});

export function recordTableRegionHeight(height: number): void {
  if (Number.isFinite(height) && height >= 420) {
    lastMeasuredTableHeight = Math.round(height);
  }
}

export function TableSkeleton({
  rows = 12,
  columns = 5,
  density = "relaxed",
  label = "กำลังโหลดข้อมูลตาราง",
}: {
  rows?: number;
  columns?: number;
  label?: string;
} & VariantProps<typeof tableSkeletonVariants>) {
  const trailingColumns = Math.max(0, columns - 3);
  const minHeightPx =
    typeof window !== "undefined" &&
    density === "relaxed" &&
    lastMeasuredTableHeight > 560
      ? lastMeasuredTableHeight
      : null;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-table-skeleton="true"
      style={minHeightPx ? { minHeight: `${minHeightPx}px` } : undefined}
      className={cn(tableSkeletonVariants({ density }))}
    >
      <span className="sr-only">{label}</span>

      <div className="hidden items-center gap-3 border-b border-border/70 bg-[#f8fafc] px-3 py-2.5 min-[900px]:flex">
        <Skeleton className="h-2.5 w-10 shrink-0" />
        <Skeleton className="h-2.5 flex-1" />
        {Array.from({ length: trailingColumns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 w-16 shrink-0" />
        ))}
        <Skeleton className="h-2.5 w-16 shrink-0" />
      </div>

      <div className="flex flex-col divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex min-w-0 items-center gap-3 px-3 py-3"
          >
            <Skeleton className="h-3 w-8 shrink-0" />
            <Skeleton
              className={cn(
                "h-3 min-w-0 flex-1",
                rowIndex % 3 === 0 ? "max-w-[60%]" : "max-w-[82%]",
              )}
            />
            <div className="hidden shrink-0 items-center gap-3 min-[900px]:flex">
              {Array.from({ length: trailingColumns }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-14" />
              ))}
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full min-[900px]:w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
