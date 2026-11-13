// มุมมอง "งานที่ต้องทำ" — คิวงานจริงจากสถานะออเดอร์ + การยกเลิก
// ไม่มีการเคลื่อนไหวโดยตั้งใจ — ตัวเลขปฏิบัติการต้องนิ่งเพื่ออ่านเทียบกันได้
//
// หลักการ: แสดงเป็นตัวเลขเฉพาะสิ่งที่ "ทำอะไรได้" (รอจัดส่ง/รอขนรับ/ยกเลิก)
// ส่วนการตรวจที่ผลออกมา "ไม่พบปัญหา" ให้สรุปเป็นประโยคเดียว ไม่ใช่การ์ดเลข 0 ที่ดูเหมือนหน้าเปล่า
// หมายเหตุข้อมูล: TikTok ไม่ได้ส่งกำหนดเวลาส่ง (SLA) มาในข้อมูลที่เราดึง จึงไม่มีการ์ด "ค้างส่งเกินกำหนด"

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CANCEL_RATE_LIMIT,
  CountLine,
  ListCard,
  Tile,
  num,
  money,
} from "@/components/platform/PlatformCards";
import { thaiDate } from "@/lib/platform/period";
import type { OpsPendingRow, TikTokOps } from "@/lib/platform/ops";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_SHIPMENT: "รอจัดส่ง",
  AWAITING_COLLECTION: "รอขนรับ",
};

function PendingLine({ row }: { row: OpsPendingRow }) {
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0">
      <span className="mono text-[13px] font-bold">{row.orderId}</span>
      <Badge variant={row.status === "AWAITING_SHIPMENT" ? "warning" : "neutral"}>
        {STATUS_LABEL[row.status] ?? row.status}
      </Badge>
      <span className="text-[12px] text-muted-foreground">{thaiDate(row.createdAt)}</span>
      <span className="truncate text-[12px] text-muted-foreground">{row.province ?? "ไม่ระบุจังหวัด"}</span>
      <span className="mono ml-auto text-[13px] font-bold">{money(row.amount)}</span>
    </li>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-5 text-muted-foreground">{children}</p>;
}

export function PlatformOpsView({
  ops,
  detailHref,
}: {
  ops: TikTokOps;
  detailHref?: (kind: "status" | "initiator" | "province" | "kpi", value: string) => string;
}) {
  const { cancels, byStatus, pending } = ops;
  const link = (kind: "status" | "initiator" | "province" | "kpi", value: string) =>
    detailHref ? detailHref(kind, value) : undefined;
  const waitingShip = byStatus.AWAITING_SHIPMENT ?? 0;
  const waitingPickup = byStatus.AWAITING_COLLECTION ?? 0;
  const inTransit = byStatus.IN_TRANSIT ?? 0;
  const allClear = ops.overdue.count === 0 && ops.noTracking.count === 0 && ops.stuck.count === 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="รอจัดส่ง"
          value={waitingShip > 0 ? `${num(waitingShip)} ออเดอร์` : "ไม่มีค้าง"}
          hint="ยังไม่ได้ส่งออกจากร้าน"
          tone={waitingShip > 0 ? "danger" : "ok"}
          href={link("status", "AWAITING_SHIPMENT")}
        />
        <Tile
          label="รอขนรับ"
          value={waitingPickup > 0 ? `${num(waitingPickup)} ออเดอร์` : "ไม่มีค้าง"}
          hint="ส่งของให้ขนส่งแล้ว รอเข้ารับ"
          tone={waitingPickup > 0 ? "warning" : "ok"}
          href={link("status", "AWAITING_COLLECTION")}
        />
        <Tile
          label="อยู่ระหว่างขนส่ง"
          value={`${num(inTransit)} ออเดอร์`}
          hint="ลูกค้ายังไม่ได้รับของ"
          tone="default"
          href={link("status", "IN_TRANSIT")}
        />
        <Tile
          label="อัตรายกเลิก"
          value={`${cancels.rate}%`}
          hint={`${num(cancels.cancelled)} จาก ${num(cancels.total)} ออเดอร์ · เกณฑ์ ${CANCEL_RATE_LIMIT}%`}
          tone={cancels.rate > CANCEL_RATE_LIMIT ? "danger" : "default"}
          href={link("kpi", "cancelled")}
        />
      </div>

      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-[12.5px] leading-6",
          allClear
            ? "border-[#cfe8da] bg-[#f6fbf8] text-[#0d6b3c]"
            : "border-[#f2e3c4] bg-[#fffdf6] text-[#7a4b0a]",
        )}
        role="status"
      >
        {allClear ? "ตรวจแล้วไม่พบปัญหา" : "มีรายการที่ต้องตรวจ"} — เลยกำหนดส่ง{" "}
        {num(ops.overdue.count)} · ไม่มีเลขพัสดุ {num(ops.noTracking.count)} · พัสดุไม่ขยับเกิน 3 วัน{" "}
        {num(ops.stuck.count)}
        <br />
        <Note>
          ถ้า TikTok ไม่ได้ส่งกำหนดเวลาส่งมา ระบบใช้เกณฑ์ 48 ชม.หลังชำระเงินในการตัดสินว่า “เลยกำหนดส่ง”
        </Note>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <ListCard
          title="ออเดอร์ที่ยังไม่จัดส่ง"
          hint={pending.rows.length > 0 ? `${num(waitingShip + waitingPickup)} ออเดอร์` : undefined}
          empty={pending.rows.length === 0}
          emptyText="ไม่มีออเดอร์ค้างจัดส่ง 🎉"
        >
          <ul className="flex min-w-0 list-none flex-col p-0">
            {pending.rows.map((row) => (
              <PendingLine key={row.orderId} row={row} />
            ))}
          </ul>
        </ListCard>

        <ListCard
          title={`ยกเลิกในงวดนี้ ${num(cancels.cancelled)} ออเดอร์`}
          hint="ใครเป็นคนยกเลิก และจังหวัดไหนถูกยกเลิกมาก"
          empty={cancels.byInitiator.length === 0}
          emptyText="ไม่มีการยกเลิกในช่วงนี้"
        >
          <div className="flex flex-wrap gap-1.5">
            {cancels.byInitiator.map((row) => (
              <Link key={row.label} href={link("initiator", row.label) ?? "#"} className="rounded-full">
                <Badge variant="neutral">
                  {row.label === "BUYER" ? "ผู้ซื้อ" : row.label === "SELLER" ? "ร้าน" : "ระบบ"} ·{" "}
                  {num(row.count)} ({row.rate}%)
                </Badge>
              </Link>
            ))}
          </div>
          <h4 className="mt-1 text-[12.5px] font-bold text-muted-foreground">จังหวัดที่ถูกยกเลิกมาก</h4>
          <ul className="flex min-w-0 list-none flex-col p-0">
            {cancels.byProvince.map((row) => (
              <CountLine
                key={row.label}
                row={row}
                unit={cancels.cancelled}
                tone="danger"
                href={link("province", row.label)}
              />
            ))}
          </ul>
          <Note>เหตุผลว่าทำไมลูกค้ายกเลิก อยู่ที่หน้า “สินค้าและเหตุผล”</Note>
        </ListCard>
      </div>
    </div>
  );
}
