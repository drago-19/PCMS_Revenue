import { cva, type VariantProps } from "class-variance-authority";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton ระดับ "หน้าเว็บ" ใช้ใน `loading.tsx` ของแต่ละ route
 * เพื่อให้กดเปลี่ยนหน้าแล้วเห็นโครงหน้าใหม่ทันที ไม่ใช่จอค้างที่หน้าเดิม
 *
 * ใช้ Skeleton (shadcn) + Card ของระบบเท่านั้น ไม่เพิ่มคลาสใหม่ลง globals.css
 */
const pageSkeletonVariants = cva("flex w-full min-w-0 flex-col gap-[14px]", {
  variants: {
    variant: {
      dashboard: "gap-[14px]",
      list: "gap-[12px]",
      document: "gap-[14px]",
      settings: "gap-[14px]",
    },
  },
  defaultVariants: {
    variant: "dashboard",
  },
});

const barVariants = cva("rounded-full", {
  variants: {
    size: {
      eyebrow: "h-2.5 w-28 max-w-[60%]",
      title: "h-6 w-[min(320px,85%)]",
      desc: "h-3 w-[min(520px,100%)]",
      label: "h-2.5 w-20 max-w-[70%]",
      value: "h-6 w-28 max-w-[80%]",
      line: "h-3 w-full",
      short: "h-3 w-[70%]",
    },
  },
  defaultVariants: { size: "line" },
});

function Bar({
  size,
  className,
}: VariantProps<typeof barVariants> & { className?: string }) {
  return <Skeleton className={cn(barVariants({ size }), className)} />;
}

function HeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <Bar size="eyebrow" />
        <Bar size="title" />
        <Bar size="desc" />
      </div>
      {withActions ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-[132px] max-w-full rounded-[10px]" />
          <Skeleton className="h-10 w-[150px] max-w-full rounded-[10px]" />
        </div>
      ) : null}
    </div>
  );
}

function StatCardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-[14px] min-[768px]:grid-cols-2 min-[1180px]:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} padding="stat" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <Bar size="label" />
            <Skeleton className="size-7 shrink-0 rounded-lg" />
          </div>
          <Bar size="value" />
          <Bar size="short" />
        </Card>
      ))}
    </div>
  );
}

function InfoCardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-[14px] min-[768px]:grid-cols-2 min-[1180px]:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="flex flex-col gap-3 p-5">
          <Skeleton className="size-10 rounded-xl" />
          <Bar size="line" className="w-[75%]" />
          <Bar size="line" />
          <Bar size="short" />
          <Skeleton className="mt-3 h-9 w-full rounded-lg" />
        </Card>
      ))}
    </div>
  );
}

function PaperSkeleton() {
  return (
    <Card className="mx-auto flex w-full max-w-[860px] flex-col gap-3 p-4 min-[640px]:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Bar size="title" className="w-[min(220px,70%)]" />
          <Bar size="label" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>

      <Skeleton className="mt-2 h-px w-full rounded-none" />

      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex flex-col gap-2 py-1">
          <Bar size="line" className={rowIndex % 2 === 0 ? "w-[92%]" : "w-[80%]"} />
          <Bar size="line" className="w-[60%]" />
        </div>
      ))}

      <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3 min-[640px]:items-end">
        <Bar size="line" className="w-[min(240px,80%)]" />
        <Bar size="value" className="w-[min(180px,60%)]" />
      </div>
    </Card>
  );
}

export function PageSkeleton({
  variant = "dashboard",
  label = "กำลังโหลดข้อมูลหน้านี้",
}: {
  label?: string;
} & VariantProps<typeof pageSkeletonVariants>) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(pageSkeletonVariants({ variant }))}
    >
      <span className="sr-only">{label}</span>

      {variant === "dashboard" ? (
        <>
          <HeaderSkeleton />
          <StatCardsSkeleton count={4} />
          <Card className="flex flex-col gap-4 p-4 min-[900px]:flex-row min-[900px]:items-stretch min-[900px]:justify-between min-[900px]:p-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Bar size="label" />
              <Bar size="title" className="w-[min(260px,70%)]" />
              <Bar size="value" className="h-8 w-[min(220px,60%)]" />
              <div className="mt-1 flex flex-wrap gap-2">
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-7 w-32 rounded-full" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Skeleton className="h-10 w-[190px] max-w-full rounded-[10px]" />
                <Skeleton className="h-10 w-[200px] max-w-full rounded-[10px]" />
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 min-[900px]:w-[260px] min-[900px]:shrink-0">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Bar size="label" className="w-full" />
                  <Bar size="line" className="w-[70%]" />
                </div>
              ))}
            </div>
          </Card>
          <InfoCardsSkeleton count={4} />
        </>
      ) : null}

      {variant === "list" ? (
        <>
          <HeaderSkeleton />
          <div className="grid grid-cols-1 gap-1.5 min-[640px]:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-lg" />
            ))}
          </div>
          <Card className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Bar key={index} size="line" className="h-8 w-full" />
            ))}
          </Card>
        </>
      ) : null}

      {variant === "document" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-10 w-[168px] max-w-full rounded-[10px]" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 w-[136px] max-w-full rounded-[10px]" />
              <Skeleton className="h-10 w-[120px] max-w-full rounded-[10px]" />
            </div>
          </div>
          <PaperSkeleton />
        </>
      ) : null}

      {variant === "settings" ? (
        <>
          <HeaderSkeleton withActions={false} />
          {Array.from({ length: 2 }).map((_, cardIndex) => (
            <Card key={cardIndex} className="flex flex-col gap-4 p-4 min-[640px]:p-5">
              <Bar size="line" className="w-[min(220px,60%)]" />
              <div className="grid grid-cols-1 gap-3 min-[768px]:grid-cols-2">
                {Array.from({ length: 4 }).map((_, fieldIndex) => (
                  <div key={fieldIndex} className="flex flex-col gap-1.5">
                    <Bar size="label" />
                    <Skeleton className="h-10 w-full rounded-[10px]" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-[190px] max-w-full rounded-[10px]" />
            </Card>
          ))}
        </>
      ) : null}
    </div>
  );
}
