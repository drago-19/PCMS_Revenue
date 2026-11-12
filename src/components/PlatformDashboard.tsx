import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { IconCheckCircle, IconInfo, IconReceipt, IconWallet } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TikTokAnalytics } from "@/lib/platform/analytics";

function money(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function change(currentValue: number, previousValue: number): { text: string; up: boolean } | null {
  if (!previousValue) return null;
  const diff = ((currentValue - previousValue) / previousValue) * 100;
  // ฐานเทียบเล็กมาก (เช่นเริ่มขายกลางปี) ทำให้ % พุ่งเป็นหลักแสน — แสดงเป็นข้อความแทนตัวเลขหลอกตา
  if (Math.abs(diff) >= 999) {
    return { text: "ฐานเทียบน้อย", up: diff >= 0 };
  }
  return {
    text: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`,
    up: diff >= 0,
  };
}

function KpiCard({
  label,
  value,
  delta,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  delta: { text: string; up: boolean } | null;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[14px] font-bold text-muted-foreground">{label}</span>
      <span
        className={
          tone === "accent"
            ? "mono truncate text-[26px] font-bold leading-tight text-[#0d8a47]"
            : "mono truncate text-[26px] font-bold leading-tight"
        }
      >
        {value}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px]">
        {delta ? (
          <span
            className={
              delta.up
                ? "inline-flex items-center rounded-full bg-[#e7f6ee] px-2 py-0.5 font-bold text-[#0d8a47]"
                : "inline-flex items-center rounded-full bg-[#fdeceb] px-2 py-0.5 font-bold text-[#b42318]"
            }
          >
            {delta.up ? "▲" : "▼"} {delta.text} เทียบช่วงก่อน
          </span>
        ) : (
          <span className="text-muted-foreground">ยังไม่มีช่วงก่อนให้เทียบ</span>
        )}
      </span>
      {hint ? <span className="text-[12.5px] text-muted-foreground">{hint}</span> : null}
    </Card>
  );
}

/** กราฟเส้นยอดโอนรายวัน — ใช้ SVG เอง ไม่ต้องโหลดไลบรารีเพิ่ม */
function TrendChart({ daily }: { daily: TikTokAnalytics["daily"] }) {
  if (daily.length < 2) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        ข้อมูลรายวันยังไม่พอวาดแนวโน้ม (ต้องมีอย่างน้อย 2 วัน)
      </p>
    );
  }

  const width = 720;
  const height = 190;
  const padX = 8;
  const padY = 16;
  const values = daily.map((point) => point.settlement);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  const points = daily.map((point, index) => {
    const x = padX + (index / (daily.length - 1)) * (width - padX * 2);
    const y = height - padY - ((point.settlement - min) / span) * (height - padY * 2);
    return { x, y, ...point };
  });

  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[190px] w-full"
        role="img"
        aria-label={`แนวโน้มยอดโอนรายวัน ${daily.length} วัน สูงสุด ${money(max)} บาท`}
      >
        <polygon points={area} fill="#0f766e14" />
        <polyline points={line} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="2.5" fill="#0f766e">
            <title>{`${shortDate(point.date)}: ${money(point.settlement)} บาท`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>{shortDate(daily[0].date)}</span>
        <span>สูงสุด ฿{money(max)} · ต่ำสุด ฿{money(Math.min(...values))}</span>
        <span>{shortDate(daily.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  current,
  previous,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  format: (value: number) => string;
}) {
  const diff = change(current, previous);
  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="py-2 pr-2 text-left text-[12.5px] font-bold">
        {label}
      </th>
      <td className="mono py-2 pr-2 text-right text-[12.5px]">{format(current)}</td>
      <td className="mono py-2 pr-2 text-right text-[12.5px] text-muted-foreground">
        {format(previous)}
      </td>
      <td
        className={
          diff
            ? diff.up
              ? "mono py-2 text-right text-[12.5px] font-bold text-[#0d8a47]"
              : "mono py-2 text-right text-[12.5px] font-bold text-[#b42318]"
            : "mono py-2 text-right text-[12.5px] text-muted-foreground"
        }
      >
        {diff ? diff.text : "—"}
      </td>
    </tr>
  );
}

const ALERT_STYLES: Record<string, string> = {
  red: "border-[#f5c2bd] bg-[#fdf3f2] text-[#8a1c14]",
  amber: "border-[#f5dfae] bg-[#fffbeb] text-[#7a4b0a]",
  green: "border-[#bfe6d0] bg-[#f2fbf6] text-[#0d6b3c]",
};

export function PlatformDashboardView({
  analytics,
}: {
  analytics: TikTokAnalytics & {
    perShop?: Array<{ shopId: string; settlement: number; orders: number; cancelled: number }>;
    periodLabel: string;
    compareLabel: string;
  };
}) {
  if (!analytics.hasData) {
    return (
      <EmptyState
        icon={<IconWallet size={22} aria-hidden="true" />}
        title="ยังไม่มีข้อมูลในช่วงนี้"
        description="เชื่อมร้านและดึงข้อมูลก่อน แล้วแดชบอร์ดจะสรุปยอดขาย สถานะออเดอร์ และจุดที่ควรตรวจให้ทันที"
        action={
          <Button asChild>
            <Link href="/settings?tab=platforms">ไปที่หน้าตั้งค่า · เชื่อมต่อ TikTok</Link>
          </Button>
        }
      />
    );
  }

  const { current, previous, rangeDays } = analytics;
  const cancelRate = current.orders ? (current.cancelled / current.orders) * 100 : 0;
  const prevCancelRate = previous.orders ? (previous.cancelled / previous.orders) * 100 : 0;
  const aov = current.orders ? current.settlement / current.orders : 0;
  const prevAov = previous.orders ? previous.settlement / previous.orders : 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Badge variant="success">ช่วง {analytics.periodLabel}</Badge>
        <span>เทียบกับ {analytics.compareLabel}</span>
        {analytics.lastSyncedAt ? (
          <span>
            · ข้อมูลถึง{" "}
            {new Date(analytics.lastSyncedAt).toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        ) : null}
      </div>

      {/* 1) KPI ที่ต้องเห็นใน 5 วินาที */}
      <div className="grid grid-cols-2 gap-2.5 min-[980px]:grid-cols-4">
        <KpiCard
          label="ยอดโอนสุทธิ"
          value={`฿${money(current.settlement)}`}
          delta={change(current.settlement, previous.settlement)}
          tone="accent"
          hint={`${current.orders.toLocaleString("th-TH")} ออเดอร์`}
        />
        <KpiCard
          label="ยอดขายก่อนหัก"
          value={`฿${money(current.revenue)}`}
          delta={change(current.revenue, previous.revenue)}
          hint={`ค่าธรรมเนียม ฿${money(Math.abs(current.fee))}`}
        />
        <KpiCard
          label="จำนวนออเดอร์"
          value={current.orders.toLocaleString("th-TH")}
          delta={change(current.orders, previous.orders)}
          hint={`ส่งถึงแล้ว ${current.delivered.toLocaleString("th-TH")}`}
        />
        <KpiCard
          label="อัตรายกเลิก"
          value={`${cancelRate.toFixed(1)}%`}
          delta={change(cancelRate, prevCancelRate)}
          hint={`ยกเลิก ${current.cancelled.toLocaleString("th-TH")} รายการ`}
        />
      </div>

      {/* สรุปประโยคเดียว — อ่านก่อนอย่างอื่น */}
      {analytics.insights.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted-foreground">
            สรุปสั้น ๆ
          </p>
          <p className="mt-1 text-[17px] font-bold leading-relaxed">{analytics.insights[0]}</p>
        </div>
      ) : null}

      {/* 2) สิ่งที่ต้องกังวล (Alert) */}
      <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-2">
        {analytics.alerts.map((alert) => (
          <div
            key={alert.title}
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[14px] leading-7 ${ALERT_STYLES[alert.level]}`}
            role="status"
          >
            <IconInfo size={15} aria-hidden="true" className="mt-1 shrink-0" />
            <span className="min-w-0">
              <span className="block font-bold">{alert.title}</span>
              <span className="block text-[13px] leading-6 opacity-85">{alert.detail}</span>
            </span>
          </div>
        ))}
      </div>

      {/* 3) แนวโน้ม */}
      <Card padding="padded" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">แนวโน้มยอดโอนรายวัน</h2>
          <span className="text-[12px] text-muted-foreground">{analytics.daily.length} วัน · บาท</span>
        </div>
        <TrendChart daily={analytics.daily} />
      </Card>

      <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 4) เปรียบเทียบ */}
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[14.5px] font-bold">เทียบช่วงก่อนหน้า</h2>
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                  ตัวชี้วัด
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">
                  ช่วงนี้
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">
                  ก่อนหน้า
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  เปลี่ยน
                </th>
              </tr>
            </thead>
            <tbody>
              <CompareRow
                label="ยอดโอน"
                current={current.settlement}
                previous={previous.settlement}
                format={(value) => `฿${money(value)}`}
              />
              <CompareRow
                label="ยอดขาย"
                current={current.revenue}
                previous={previous.revenue}
                format={(value) => `฿${money(value)}`}
              />
              <CompareRow
                label="ออเดอร์"
                current={current.orders}
                previous={previous.orders}
                format={(value) => value.toLocaleString("th-TH")}
              />
              <CompareRow
                label="เฉลี่ย/ออเดอร์"
                current={aov}
                previous={prevAov}
                format={(value) => `฿${money(value)}`}
              />
              <CompareRow
                label="อัตรายกเลิก"
                current={cancelRate}
                previous={prevCancelRate}
                format={(value) => `${value.toFixed(1)}%`}
              />
            </tbody>
          </table>
        </Card>

        {/* 5) สาเหตุ — เหตุผลยกเลิก */}
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[14.5px] font-bold">ยกเลิกเพราะอะไร</h2>
          {analytics.cancelReasons.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">ไม่มีออเดอร์ยกเลิกในช่วงนี้</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {analytics.cancelReasons.map((reason) => {
                const share = current.cancelled ? Math.round((reason.count / current.cancelled) * 100) : 0;
                return (
                  <li key={reason.reason} className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate">{reason.reason}</span>
                      <span className="mono shrink-0 text-muted-foreground">
                        {reason.count} · {share}%
                      </span>
                    </div>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-[#b42318]"
                        style={{ width: `${Math.max(3, share)}%` }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* แยกตามร้าน (แสดงเมื่อดู "ทุกร้าน" และมีมากกว่า 1 ร้าน) */}
      {(analytics.perShop?.length ?? 0) > 1 ? (
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14.5px] font-bold">แยกตามร้าน</h2>
            <span className="text-[12px] text-muted-foreground">ช่วง {analytics.rangeDays} วัน</span>
          </div>
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">ร้าน (shop id)</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">ยอดโอน</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">ออเดอร์</th>
                <th scope="col" className="py-1.5 text-right font-bold">ยกเลิก</th>
              </tr>
            </thead>
            <tbody>
              {analytics.perShop!.map((shop) => (
                <tr key={shop.shopId} className="border-b border-border last:border-0">
                  <td className="mono py-1.5 pr-2 truncate">{shop.shopId}</td>
                  <td className="mono py-1.5 pr-2 text-right">฿{money(shop.settlement)}</td>
                  <td className="mono py-1.5 pr-2 text-right">{shop.orders.toLocaleString("th-TH")}</td>
                  <td className="mono py-1.5 text-right">{shop.cancelled.toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* 5b) สาเหตุ — สินค้าทำยอด */}
      <Card padding="padded" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
            <IconReceipt size={15} aria-hidden="true" />
            สินค้าที่ทำยอดสูงสุด
          </h2>
          <span className="text-[12px] text-muted-foreground">เรียงตามยอดขายก่อนหัก</span>
        </div>
        <ul className="flex list-none flex-col gap-2 p-0">
          {analytics.topProducts.map((product) => {
            const max = analytics.topProducts[0]?.revenue || 1;
            return (
              <li key={product.name} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate font-bold">{product.name}</span>
                  <span className="mono shrink-0">
                    ฿{money(product.revenue)} · {product.quantity} ชิ้น
                  </span>
                </div>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-[#0f766e]"
                    style={{ width: `${Math.max(3, Math.round((product.revenue / max) * 100))}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* 6) ข้อสรุปที่ลงมือได้ */}
      <Card variant="info" padding="padded" className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
          <IconCheckCircle size={15} aria-hidden="true" className="text-[#0d8a47]" />
          สรุปให้ตัดสินใจ
        </h2>
        <ul className="ml-4 list-disc text-[13px] leading-6">
          {analytics.insights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings?tab=platforms">จัดการการเชื่อมต่อ / ทดสอบดึงข้อมูล</Link>
        </Button>
        <span className="text-[12px] text-muted-foreground">
          ตัวเลขคำนวณจากฐานข้อมูลของเรา (ข้อมูลที่ดึงจาก TikTok) — ไม่ได้ยิงถาม TikTok ทุกครั้งที่เปิดหน้า
        </span>
      </div>
    </div>
  );
}
