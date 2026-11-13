// หน้านี้ไม่มีการเคลื่อนไหวโดยตั้งใจ — ตัวเลขปฏิบัติการต้องนิ่งเพื่ออ่านเทียบกันได้
// ใช้เฉพาะข้อมูลที่เก็บไว้แล้วจาก TikTok (platform_*) ไม่พึ่ง Shipnity

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OpsCountRow, OpsOrderRow, TikTokOps } from "@/lib/platform/ops";

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : null}
    </span>
  );
}

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

function Tile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "warning" | "ok";
}) {
  const color =
    tone === "danger"
      ? "text-[#b42318]"
      : tone === "warning"
        ? "text-[#b45309]"
        : tone === "ok"
          ? "text-[#0d8a47]"
          : "text-foreground";

  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-1">
      <span className="text-[13.5px] font-bold text-muted-foreground">{label}</span>
      <span className={`mono truncate text-[24px] font-bold leading-tight ${color}`}>{value}</span>
      <span className="text-[12px] leading-5 text-muted-foreground">{hint}</span>
    </Card>
  );
}

function OrderLine({ row }: { row: OpsOrderRow }) {
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0">
      <span className="mono text-[13px] font-bold">{row.orderId}</span>
      <Badge variant={row.hoursLate > 24 ? "danger" : "warning"}>
        {row.hoursLate > 0 ? `เกิน ${num(row.hoursLate)} ชม.` : "ครบกำหนด"}
      </Badge>
      <span className="text-[12.5px] text-muted-foreground">{row.province ?? "ไม่ระบุจังหวัด"}</span>
      <span className="mono ml-auto text-[13px] font-bold">{money(row.amount)}</span>
    </li>
  );
}

function CountLine({ row, unit }: { row: OpsCountRow; unit: number }) {
  const width = unit > 0 ? Math.max(4, Math.round((row.count / unit) * 100)) : 0;
  return (
    <li className="flex min-w-0 flex-col gap-1 py-1.5">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-[13px]">{row.label}</span>
        <span className="mono shrink-0 text-[12.5px] font-bold text-muted-foreground">
          {num(row.count)} · {row.rate}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-slate-400" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

export function PlatformOpsView({ ops }: { ops: TikTokOps }) {
  const { overdue, noTracking, stuck, cancels, products, price } = ops;
  const discount = price.avgList > 0 ? Math.round((1 - price.avgSale / price.avgList) * 100) : 0;

  return (
    <section aria-label="ปฏิบัติการขายและสินค้า" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">ปฏิบัติการขายและสินค้า</h2>
        <span className="text-[12px] text-muted-foreground">
          ช่วง {ops.range.from} → {ops.range.to} · จากข้อมูลที่ดึงไว้แล้ว
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="ค้างส่งเกินกำหนด"
          value={`${num(overdue.count)} ออเดอร์`}
          hint="เลยเวลาที่ TikTok กำหนดให้ส่ง"
          tone={overdue.count > 0 ? "danger" : "ok"}
        />
        <Tile
          label="ไม่มีเลขพัสดุ"
          value={`${num(noTracking.count)} ออเดอร์`}
          hint="จัดส่งแล้วแต่ยังไม่มี tracking"
          tone={noTracking.count > 0 ? "warning" : "ok"}
        />
        <Tile
          label="พัสดุไม่ขยับ"
          value={`${num(stuck.count)} พัสดุ`}
          hint="ไม่มีความเคลื่อนไหวเกิน 3 วัน"
          tone={stuck.count > 0 ? "warning" : "ok"}
        />
        <Tile
          label="อัตรายกเลิก"
          value={`${cancels.rate}%`}
          hint={`${num(cancels.cancelled)} จาก ${num(cancels.total)} ออเดอร์`}
          tone={cancels.rate > 10 ? "danger" : "default"}
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[14px] font-bold">ต้องส่งวันนี้ / เลยกำหนดแล้ว</h3>
          {overdue.rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">ไม่มีออเดอร์ที่เลยกำหนดส่ง 🎉</p>
          ) : (
            <ul className="flex min-w-0 flex-col">
              {overdue.rows.map((row) => (
                <OrderLine key={row.orderId} row={row} />
              ))}
            </ul>
          )}
          {overdue.count > overdue.rows.length ? (
            <p className="text-[12px] text-muted-foreground">
              และอีก {num(overdue.count - overdue.rows.length)} ออเดอร์ — ดูทั้งหมดในรายละเอียดรายออเดอร์
            </p>
          ) : null}
        </Card>

        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[14px] font-bold">ยกเลิกในงวดนี้ {num(cancels.cancelled)} ออเดอร์</h3>
          {cancels.byInitiator.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">ไม่มีการยกเลิกในช่วงนี้</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {cancels.byInitiator.map((row) => (
                  <Badge key={row.label} variant="neutral">
                    {row.label === "BUYER" ? "ผู้ซื้อ" : row.label === "SELLER" ? "ร้าน" : row.label} ·{" "}
                    {num(row.count)} ({row.rate}%)
                  </Badge>
                ))}
              </div>
              <h4 className="mt-1 text-[12.5px] font-bold text-muted-foreground">เหตุผลที่ถูกยกเลิก</h4>
              <ul className="flex min-w-0 flex-col">
                {cancels.byReason.map((row) => (
                  <CountLine key={row.label} row={row} unit={cancels.cancelled} />
                ))}
              </ul>
              <h4 className="mt-1 text-[12.5px] font-bold text-muted-foreground">จังหวัดที่ถูกยกเลิกมาก</h4>
              <ul className="flex min-w-0 flex-col">
                {cancels.byProvince.map((row) => (
                  <CountLine key={row.label} row={row} unit={cancels.cancelled} />
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[14px] font-bold">ขายดีในงวดนี้</h3>
          <ul className="flex min-w-0 flex-col">
            {products.top.map((row) => (
              <li
                key={`${row.name}-${row.sku}`}
                className="flex min-w-0 items-center justify-between gap-2 border-b border-border/70 py-2 last:border-0"
              >
                <Thumb src={row.image} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{row.name}</span>
                  {row.sku ? (
                    <span className="mono block truncate text-[11.5px] text-muted-foreground">{row.sku}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="mono block text-[13px] font-bold">{money(row.revenue)}</span>
                  <span className="text-[11.5px] text-muted-foreground">{num(row.quantity)} ชิ้น</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="padded" className="flex min-w-0 flex-col gap-3">
          <div>
            <h3 className="text-[14px] font-bold">ราคาที่ขายได้จริง vs ราคาตั้ง</h3>
            <p className="text-[13px] leading-6">
              ตั้งไว้เฉลี่ย <span className="mono font-bold">{money(price.avgList)}</span> · ขายได้จริง{" "}
              <span className="mono font-bold">{money(price.avgSale)}</span>{" "}
              <Badge variant={discount >= 30 ? "warning" : "neutral"}>ลดจริง {discount}%</Badge>
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              คิดจาก {num(price.units)} รายการในงวดนี้ · ราคาตั้งคือก่อนหักส่วนลดที่ร้านตั้งไว้ (ยังไม่หักค่าธรรมเนียม/ค่าส่ง)
            </p>
          </div>

          <div>
            <h4 className="text-[12.5px] font-bold text-muted-foreground">ถูกยกเลิกบ่อย</h4>
            {products.byCancel.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">ยังไม่มีสินค้าที่ขายเกิน 10 ชิ้นในงวดนี้</p>
            ) : (
              <ul className="flex min-w-0 flex-col">
                {products.byCancel.map((row) => (
                  <li
                    key={`cancel-${row.name}`}
                    className="flex min-w-0 items-center justify-between gap-2 border-b border-border/70 py-1.5 last:border-0"
                  >
                    <Thumb src={row.image} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{row.name}</span>
                    <span className="mono shrink-0 text-[12.5px] font-bold text-[#b42318]">
                      {row.rate}% ({num(row.cancelled)}/{num(row.sold)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-[12.5px] font-bold text-muted-foreground">ขายได้งวดก่อน แต่เงียบงวดนี้</h4>
            {products.dropped.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">ไม่มีสินค้าที่หลุดในช่วงนี้</p>
            ) : (
              <ul className="flex min-w-0 flex-col">
                {products.dropped.map((row) => (
                  <li
                    key={`dropped-${row.name}`}
                    className="flex min-w-0 items-center justify-between gap-2 border-b border-border/70 py-1.5 last:border-0"
                  >
                    <Thumb src={row.image} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{row.name}</span>
                    <span className="mono shrink-0 text-[12px] text-muted-foreground">
                      เคยขาย {num(row.quantity)} ชิ้น
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="rounded-lg bg-muted px-3 py-2 text-[11.5px] leading-5 text-muted-foreground">
            กำไรสุทธิยังคิดไม่ได้: ฐานข้อมูลยังไม่มีต้นทุนสินค้า (cost_price = 0 ทุก SKU) — ตอนนี้คิดได้ถึงขั้น
            “ยอดขาย − ค่าธรรมเนียม − ค่าส่ง” จาก statement
          </p>
        </Card>
      </div>
    </section>
  );
}
