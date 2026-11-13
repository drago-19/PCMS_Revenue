// ป๊อปอัป "รายละเอียดเบื้องหลังการ์ด" — ใช้ตัวเดียวกับทุกการ์ดในหมวดแพลตฟอร์ม
// ไม่มีการเคลื่อนไหวโดยตั้งใจ: เปิดมาแล้วต้องอ่านตัวเลขได้ทันที

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseStamp } from "@/lib/platform/period";
import type { DetailView } from "@/lib/platform/details";

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "รอชำระ",
  ON_HOLD: "พักไว้",
  AWAITING_SHIPMENT: "รอจัดส่ง",
  PARTIALLY_SHIPPING: "ส่งบางส่วน",
  AWAITING_COLLECTION: "รอขนรับ",
  IN_TRANSIT: "กำลังส่ง",
  DELIVERED: "ส่งถึงแล้ว",
  COMPLETED: "สำเร็จ",
  CANCELLED: "ยกเลิก",
  RETURNED: "คืนสินค้า",
  LOST: "สูญหาย",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  DELIVERED: "success",
  COMPLETED: "success",
  AWAITING_SHIPMENT: "danger",
  AWAITING_COLLECTION: "warning",
  IN_TRANSIT: "neutral",
  CANCELLED: "danger",
};

// จัดรูปแบบเองแทน Intl เพื่อให้ HTML ฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์ตรงกันเสมอ (กัน hydration mismatch)
function group(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function num(value: number): string {
  return group(value);
}

function detailMoney(value: number): string {
  return `฿${group(value)}`;
}

function shortDateTime(iso: string): string {
  const date = parseStamp(iso);
  if (!date) return "—";
  // บวก 7 ชั่วโมงแล้วอ่านด้วย getUTC* → ได้เวลาไทยเสมอ ไม่ขึ้นกับ timezone ของเครื่องที่เรนเดอร์
  const bkk = new Date(date.getTime() + 7 * 3_600_000);
  const day = String(bkk.getUTCDate()).padStart(2, "0");
  const month = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const year = String((bkk.getUTCFullYear() + 543) % 100).padStart(2, "0");
  const hour = String(bkk.getUTCHours()).padStart(2, "0");
  const minute = String(bkk.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function PlatformDetailDialog({ view, closeHref }: { view: DetailView; closeHref: string }) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref);
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-[16px] leading-6">{view.title}</DialogTitle>
          <p className="text-[12px] leading-5 text-muted-foreground">{view.description}</p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
            <span>
              ออเดอร์ <b className="mono">{num(view.total)}</b>
            </span>
            <span>
              ยอดรวม <b className="mono">{detailMoney(view.amount)}</b>
            </span>
            {view.settlement !== null ? (
              <span>
                โอนสุทธิ <b className="mono text-[#0d8a47]">{detailMoney(view.settlement)}</b>
              </span>
            ) : null}
          </div>

          {view.rows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">ไม่มีออเดอร์ตามเงื่อนไขนี้</p>
          ) : (
            <ul className="flex list-none flex-col p-0">
              {view.rows.map((row) => (
                <li key={`${row.orderId}-${row.createTime}`} className="border-b border-border/70 py-2.5 last:border-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Link
                      href={`/platform/orders?order=${encodeURIComponent(row.orderId)}`}
                      className="mono text-[12.5px] font-bold underline underline-offset-2 hover:text-foreground"
                    >
                      {row.orderId}
                    </Link>
                    <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    <span className="text-[11.5px] text-muted-foreground">{shortDateTime(row.createTime)}</span>
                    <span className="mono ml-auto text-[12.5px] font-bold">{detailMoney(row.totalAmount)}</span>
                  </div>
                  {row.items.length > 0 ? (
                    <p className="mt-0.5 min-w-0 truncate text-[11.5px] text-muted-foreground">
                      {row.items
                        .slice(0, 3)
                        .map((item) => `${item.name} ×${item.quantity}`)
                        .join(" · ")}
                      {row.items.length > 3 ? ` · +อีก ${row.items.length - 3} รายการ` : ""}
                    </p>
                  ) : null}
                  {row.cancelReason && row.status === "CANCELLED" ? (
                    <p className="mt-0.5 text-[11.5px] text-[#b42318]">ยกเลิก: {row.cancelReason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] text-muted-foreground">
              {view.total > view.rows.length
                ? `แสดง ${num(view.rows.length)} จาก ${num(view.total)} ออเดอร์`
                : ""}
            </span>
            <Button variant="outline" size="sm" onClick={() => router.push(closeHref)}>
              ปิด
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


