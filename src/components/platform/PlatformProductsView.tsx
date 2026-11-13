// มุมมอง "สินค้าและเหตุผล" — ทำไมออเดอร์ถูกยกเลิก สินค้าขายดี ราคาจริง vs ราคาตั้ง
// รวมข้อมูลจากทั้ง analytics (เหตุผลยกเลิก) และ ops (สินค้า) ไว้หน้าเดียว
// ไม่มีการเคลื่อนไหวโดยตั้งใจ — ตัวเลขต้องนิ่งเพื่ออ่านเทียบกันได้

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CountLine, ListCard, Thumb, money, num } from "@/components/platform/PlatformCards";
import type { TikTokAnalytics } from "@/lib/platform/analytics";
import type { TikTokOps } from "@/lib/platform/ops";

export function PlatformProductsView({
  analytics,
  products,
  price,
  detailHref,
}: {
  analytics: TikTokAnalytics;
  products: TikTokOps["products"];
  price: TikTokOps["price"];
  detailHref?: (kind: "reason" | "product", value: string, label?: string) => string;
}) {
  const link = (kind: "reason" | "product", value: string, label?: string) =>
    detailHref ? detailHref(kind, value, label) : undefined;
  const discount = price.avgList > 0 ? Math.round((1 - price.avgSale / price.avgList) * 100) : 0;
  const cancelledTotal = analytics.current.cancelled;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-bold">ทำไมออเดอร์ถูกยกเลิก</h3>
          <span className="text-[11.5px] text-muted-foreground">
            จาก {num(cancelledTotal)} ออเดอร์ที่ยกเลิก · แสดงเหตุผลที่พบบ่อยที่สุด
          </span>
        </div>
        {analytics.cancelReasons.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">ไม่มีออเดอร์ยกเลิกในช่วงนี้</p>
        ) : (
          <ul className="flex min-w-0 list-none flex-col p-0">
            {analytics.cancelReasons.map((reason) => (
              <CountLine
                key={reason.reason}
                row={{
                  label: reason.reason,
                  count: reason.count,
                  rate: cancelledTotal ? Math.round((reason.count / cancelledTotal) * 1000) / 10 : 0,
                }}
                unit={cancelledTotal}
                tone="danger"
                href={link("reason", reason.reason)}
              />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <ListCard title="ขายดีในงวดนี้" hint="เรียงตามยอดขาย" empty={products.top.length === 0}>
          <ul className="flex min-w-0 list-none flex-col p-0">
            {products.top.map((row) => (
              <li key={`${row.name}-${row.sku}`} className="border-b border-border/70 last:border-0">
                <Link
                  href={link("product", row.sku ?? row.name, row.name) ?? "#"}
                  className="flex min-w-0 items-center gap-2 rounded-lg py-2 hover:bg-muted/40"
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
                </Link>
              </li>
            ))}
          </ul>
        </ListCard>

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
              <ul className="flex min-w-0 list-none flex-col p-0">
                {products.byCancel.map((row) => (
                  <li key={`cancel-${row.name}`} className="border-b border-border/70 last:border-0">
                    <Link
                      href={link("product", row.name, row.name) ?? "#"}
                      className="flex min-w-0 items-center gap-2 rounded-lg py-1.5 hover:bg-muted/40"
                    >
                    <Thumb src={row.image} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{row.name}</span>
                    <span className="mono shrink-0 text-[12.5px] font-bold text-[#b42318]">
                      {row.rate}% ({num(row.cancelled)}/{num(row.sold)})
                    </span>
                    </Link>
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
              <ul className="flex min-w-0 list-none flex-col p-0">
                {products.dropped.map((row) => (
                  <li key={`dropped-${row.name}`} className="border-b border-border/70 last:border-0">
                    <Link
                      href={link("product", row.name, row.name) ?? "#"}
                      className="flex min-w-0 items-center gap-2 rounded-lg py-1.5 hover:bg-muted/40"
                    >
                    <Thumb src={row.image} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{row.name}</span>
                    <span className="mono shrink-0 text-[12px] text-muted-foreground">
                      เคยขาย {num(row.quantity)} ชิ้น
                    </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
