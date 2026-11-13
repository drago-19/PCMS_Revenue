// หน้าภาพรวมของแพลตฟอร์ม — ตอบคำถามเดียว: "ช่วงนี้ได้เท่าไร และดีขึ้นหรือแย่ลง"
// ไม่มีการเคลื่อนไหวโดยตั้งใจ: ตัวเลขต้องนิ่งเพื่อให้กวาดตาเทียบกันได้
// ตัวเลขแต่ละตัวถูกพูดครั้งเดียวที่นี่ (ค่าอยู่ใน KPI, การเปลี่ยนแปลงอยู่ในป้ายข้างค่า)
// ตารางเทียบช่วงก่อนหน้าเดิมถูกรวมเข้ามาเป็นป้าย +/- ในใบ KPI เพื่อไม่ให้พูดซ้ำ

import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { IconInfo, IconWallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CANCEL_RATE_LIMIT, PlatformStat } from "@/components/platform/PlatformCards";
import type { TikTokAnalytics } from "@/lib/platform/analytics";
import { cn } from "@/lib/utils";

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

/** ปัดค่าสูงสุดขึ้นเป็นเลขกลม เพื่อให้แกนตั้งอ่านง่าย */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function compact(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return Math.round(value).toLocaleString("th-TH");
}

/** กราฟเส้นยอดโอนรายวัน — SVG เอง ไม่โหลดไลบรารีเพิ่ม แต่มีสเกลแกนตั้งให้อ่านค่าได้ */
function TrendChart({ daily }: { daily: TikTokAnalytics["daily"] }) {
  if (daily.length < 2) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        ข้อมูลรายวันยังไม่พอวาดแนวโน้ม (ต้องมีอย่างน้อย 2 วัน)
      </p>
    );
  }

  const width = 720;
  const height = 210;
  const padTop = 12;
  const padBottom = 28;
  const padLeft = 44;
  const padRight = 10;
  const plotHeight = height - padTop - padBottom;
  const plotWidth = width - padLeft - padRight;

  const values = daily.map((point) => point.settlement);
  const top = niceCeil(Math.max(...values, 1));
  const ticks = [0, top / 2, top];

  const xAt = (index: number) => padLeft + (index / (daily.length - 1)) * plotWidth;
  const yAt = (value: number) => padTop + plotHeight - (value / top) * plotHeight;

  const points = daily.map((point, index) => ({ x: xAt(index), y: yAt(point.settlement), ...point }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${padLeft},${padTop + plotHeight} ${line} ${padLeft + plotWidth},${padTop + plotHeight}`;
  const labelIndexes = [0, Math.floor((daily.length - 1) / 2), daily.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[210px] w-full"
        role="img"
        aria-label={`แนวโน้มยอดโอนรายวัน ${daily.length} วัน สูงสุด ${money(top)} บาท`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={padLeft + plotWidth}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray={tick === 0 ? undefined : "3 4"}
            />
            <text x={padLeft - 8} y={yAt(tick) + 4} textAnchor="end" fontSize="10.5" fill="#64748b">
              {compact(tick)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="#0d8a4714" />
        <polyline points={line} fill="none" stroke="#0d8a47" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="2.5" fill="#0d8a47">
            <title>{`${shortDate(point.date)}: ${money(point.settlement)} บาท`}</title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text
            key={`x-${index}`}
            x={xAt(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}
            fontSize="10.5"
            fill="#64748b"
          >
            {shortDate(daily[index].date)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
        <span>แกนตั้ง: บาท/วัน</span>
        <span>
          สูงสุด ฿{money(Math.max(...values))} · ต่ำสุด ฿{money(Math.min(...values))}
        </span>
      </div>
    </div>
  );
}

const ALERT_STYLES: Record<string, string> = {
  red: "border-[#f0cfcb] bg-[#fdf5f4] text-[#8a1c14]",
  amber: "border-[#f2e3c4] bg-[#fffdf6] text-[#7a4b0a]",
  green: "border-[#cfe8da] bg-[#f6fbf8] text-[#0d6b3c]",
};

export function PlatformOverviewView({
  analytics,
  detailHref,
}: {
  analytics: TikTokAnalytics & {
    perShop?: Array<{ shopId: string; settlement: number; orders: number; cancelled: number }>;
    periodLabel: string;
    compareLabel: string;
  };
  /** ลิงก์ไปป๊อปอัปออเดอร์เบื้องหลังตัวเลขในการ์ด */
  detailHref?: (kind: "kpi", value: string) => string;
}) {
  const kpiHref = (value: string) => (detailHref ? detailHref("kpi", value) : undefined);
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

  const { current, previous } = analytics;
  const cancelRate = current.orders ? (current.cancelled / current.orders) * 100 : 0;
  const prevCancelRate = previous.orders ? (previous.cancelled / previous.orders) * 100 : 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span>
          เทียบกับช่วงยาวเท่ากันก่อนหน้า · ค่าติดลบได้จริงตามไฟล์ของแพลตฟอร์ม
        </span>
      </div>

      {analytics.alerts.length > 0 ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] leading-6",
            ALERT_STYLES[analytics.alerts[0].level],
          )}
          role="status"
        >
          <IconInfo size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block font-bold">{analytics.alerts[0].title}</span>
            <span className="block text-[12px] opacity-85">{analytics.alerts[0].detail}</span>
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
        <PlatformStat
          label="ยอดโอนสุทธิ"
          value={`฿${money(current.settlement)}`}
          delta={change(current.settlement, previous.settlement)}
          goodWhen="up"
          tone="positive"
          hint={`${current.orders.toLocaleString("th-TH")} ออเดอร์`}
          href={kpiHref("settlement")}
        />
        <PlatformStat
          label="ยอดขายก่อนหัก"
          value={`฿${money(current.revenue)}`}
          delta={change(current.revenue, previous.revenue)}
          goodWhen="up"
          hint={`ค่าธรรมเนียม ฿${money(Math.abs(current.fee))}`}
          href={kpiHref("revenue")}
        />
        <PlatformStat
          label="จำนวนออเดอร์"
          value={current.orders.toLocaleString("th-TH")}
          delta={change(current.orders, previous.orders)}
          goodWhen="up"
          hint={`ส่งถึงแล้ว ${current.delivered.toLocaleString("th-TH")}`}
          href={kpiHref("orders")}
        />
        <PlatformStat
          label="อัตรายกเลิก"
          value={`${cancelRate.toFixed(1)}%`}
          delta={change(cancelRate, prevCancelRate)}
          goodWhen="down"
          tone={cancelRate >= CANCEL_RATE_LIMIT ? "negative" : "default"}
          hint={`ยกเลิก ${current.cancelled.toLocaleString("th-TH")} รายการ · เกณฑ์ ${CANCEL_RATE_LIMIT}%`}
          href={kpiHref("cancelled")}
        />
      </div>

      <Card padding="padded" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">แนวโน้มยอดโอนรายวัน</h2>
          <span className="text-[12px] text-muted-foreground">{analytics.daily.length} วัน · บาท</span>
        </div>
        <TrendChart daily={analytics.daily} />
      </Card>

      {analytics.insights.length > 0 ? (
        <Card variant="info" padding="padded" className="flex flex-col gap-1.5">
          <h2 className="text-[14.5px] font-bold">อ่านอะไรจากตัวเลขนี้</h2>
          <ul className="ml-4 list-disc text-[13px] leading-6 text-muted-foreground">
            {analytics.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {(analytics.perShop?.length ?? 0) > 1 ? (
        <Card padding="padded" className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[14.5px] font-bold">แยกตามร้าน</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                    ร้าน (shop id)
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-bold">
                    ยอดโอน
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-bold">
                    ออเดอร์
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    ยกเลิก
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.perShop!.map((shop) => (
                  <tr key={shop.shopId} className="border-b border-border last:border-0">
                    <td className="mono truncate py-1.5 pr-2">{shop.shopId}</td>
                    <td className="mono py-1.5 pr-2 text-right">฿{money(shop.settlement)}</td>
                    <td className="mono py-1.5 pr-2 text-right">{shop.orders.toLocaleString("th-TH")}</td>
                    <td className="mono py-1.5 text-right">{shop.cancelled.toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <p className="text-[12px] leading-5 text-muted-foreground">
        กำไรสุทธิยังคิดไม่ได้ เพราะฐานข้อมูลยังไม่มีต้นทุนสินค้า (cost_price = 0 ทุก SKU) — ตอนนี้คิดได้ถึงขั้น
        “ยอดขาย − ค่าธรรมเนียม − ค่าส่ง” จาก statement
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/platform/ops">ไปดูงานที่ต้องทำวันนี้</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/platform/products">ไปดูสินค้าและเหตุผลการยกเลิก</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/platform/stocks">สต็อกของร้านนี้</Link>
        </Button>
      </div>
    </div>
  );
}
