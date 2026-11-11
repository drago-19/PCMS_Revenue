"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface OrderDetailView {
  orderCode: string;
  customerName: string | null;
  status: string | null;
  courier: string;
  channel: string | null;
  orderedAt: string;
  total: string;
  daysPending: number;
  items: { name: string; quantity: number; image: string | null }[];
}

/**
 * ป๊อปอัพรายละเอียดบิล — เปิดจากพารามิเตอร์ `?order=` ใน URL
 * ปิดแล้วลบพารามิเตอร์นั้นออก หน้าจึงอยู่ที่เดิม (ไม่เลื่อนขึ้นบน)
 */
export function OrderDetailDialog({ detail }: { detail: OrderDetailView | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete("order");
    const query = next.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  }

  return (
    <Dialog
      open={detail !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle>บิล {detail.orderCode}</DialogTitle>
              <DialogDescription>
                {detail.customerName ?? "-"} · {detail.status ?? "-"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{detail.courier}</Badge>
              {detail.channel ? <Badge variant="neutral">{detail.channel}</Badge> : null}
              {detail.daysPending > 0 ? (
                <Badge variant="warning">ค้าง {detail.daysPending} วัน</Badge>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              สั่งเมื่อ {detail.orderedAt} · {detail.total}
            </p>

            <ul className="flex flex-col gap-1 text-sm">
              {detail.items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-1.5"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-md border border-dashed border-border text-[9px] text-muted-foreground">
                      ไม่มีรูป
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                  <span className="shrink-0 font-semibold text-foreground">×{item.quantity}</span>
                </li>
              ))}
              {detail.items.length === 0 ? (
                <li className="text-muted-foreground">ไม่มีรายการสินค้าในบิลนี้</li>
              ) : null}
            </ul>

            <p className="text-sm font-bold text-foreground">
              รวม {detail.items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
