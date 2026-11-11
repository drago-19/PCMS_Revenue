import { IconSpinner } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <div className="workspace-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-full max-w-[460px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-[168px] rounded-[10px]" />
          <Skeleton className="h-10 w-[132px] rounded-[10px]" />
          <Skeleton className="h-10 w-[150px] rounded-[10px]" />
        </div>
      </div>

      <Skeleton className="h-[76px] w-full rounded-2xl" />

      <div className="stats">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[104px] rounded-2xl" />
        ))}
      </div>

      <div
        className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground"
        role="status"
      >
        <IconSpinner size={16} />
        กำลังดึงออเดอร์ล่าสุดจาก Shipnity…
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-3 w-full max-w-[520px]" />
        <div className="mt-2 flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
