// หน้าข้อมูลลูกค้า — หน้านี้ไม่มีการเคลื่อนไหวโดยตั้งใจ
// เป็นแดชบอร์ดที่อ่านค่าอย่างเดียว (server-rendered) ตัวเลขต้องนิ่งเพื่อให้อ่านเทียบกันได้
// ถ้าเพิ่มอนิเมชันภายหลัง ให้ระบุเหตุผลที่มันช่วยอ่านข้อมูล ไม่ใช่เพื่อความสวย

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { PeriodPicker } from "@/components/PeriodPicker";
import { IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCustomerInsights, type AreaRow, type TopCustomer } from "@/lib/platform/customers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "ข้อมูลลูกค้า · TikTok Shop" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isoDay(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
}

function monthStart(): string {
  const date = new Date();
  date.setDate(1);
  return isoDay(date);
}

function prevMonthStart(): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return isoDay(date);
}

function prevMonthEnd(): string {
  const date = new Date();
  date.setDate(0);
  return isoDay(date);
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function shortDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}

/** สัดส่วนความยาวแท่ง เทียบกับค่าที่มากที่สุดในลิสต์เดียวกัน */
function share(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(3, Math.round((value / max) * 100));
}

function CustomerRow({ customer, rank, max }: { customer: TopCustomer; rank: number; max: number }) {
  const place = [customer.district, customer.province].filter(Boolean).join(" · ") || "ไม่ทราบพื้นที่";
  return (
    <li className="flex flex-col gap-1.5 border-b border-slate-200/70 py-3 last:border-b-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="w-5 shrink-0 text-[12px] font-bold text-muted-foreground tabular-nums">{rank}</span>
          <span className="min-w-0 truncate text-[13.5px] font-bold text-foreground">{customer.name}</span>
        </div>
        <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-[#0f766e]">฿{money(customer.spend)}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-7 text-[12px] text-muted-foreground">
        <span className="truncate">{place}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{customer.orders} ออเดอร์</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">ล่าสุด {shortDate(customer.lastOrderAt)}</span>
      </div>
      <span className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-[#0f766e]" style={{ width: `${share(customer.spend, max)}%` }} />
      </span>
      {customer.products.length > 0 ? (
        <p className="ml-7 min-w-0 truncate text-[12px] text-[#475569]">
          ซื้อ: {customer.products.map((product) => product.name).join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

function AreaList({
  rows,
  max,
  labelOf,
}: {
  rows: AreaRow[];
  max: number;
  labelOf: (row: AreaRow) => string;
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={labelOf(row)} className="flex flex-col gap-1.5 border-b border-slate-200/70 py-2.5 last:border-b-0">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-bold text-foreground">{labelOf(row)}</span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#0f766e]">฿{money(row.spend)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            <span className="shrink-0 tabular-nums">{row.orders} ออเดอร์</span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 flex-1 tabular-nums">{row.customers} ลูกค้า</span>
          </div>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-[#0f766e]" style={{ width: `${share(row.spend, max)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[19px] font-extrabold tabular-nums leading-tight text-foreground">{value}</span>
      {hint ? <span className="text-[11.5px] leading-4 text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const fromParam = read(params, "from");
  const toParam = read(params, "to");
  const selectedShop = read(params, "shop") || undefined;

  const insights = await getCustomerInsights({
    from: fromParam || undefined,
    to: toParam || undefined,
    rangeDays: 30,
    shopId: selectedShop,
  });

  const periodPresets = [
    { key: "7d", label: "7 วัน", from: daysAgo(7) },
    { key: "30d", label: "30 วัน", from: daysAgo(30) },
    { key: "month", label: "เดือนนี้", from: monthStart() },
    { key: "prevmonth", label: "เดือนก่อน", from: prevMonthStart(), to: prevMonthEnd() },
    { key: "year", label: "ทั้งปี 69", from: "2026-01-01" },
  ];

  const maxCustomer = insights.topCustomers[0]?.spend ?? 0;
  const maxProvince = insights.topProvinces[0]?.spend ?? 0;
  const maxDistrict = insights.topDistricts[0]?.spend ?? 0;
  const repeatRate =
    insights.totals.customers > 0
      ? Math.round((insights.totals.repeatCustomers / insights.totals.customers) * 1000) / 10
      : 0;

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · ข้อมูลลูกค้า"
        title="ข้อมูลลูกค้า"
        description="ใครซื้อเยอะที่สุด ซื้ออะไร และอยู่จังหวัด/อำเภอไหน — นับจากออเดอร์ที่ซื้อจริงในช่วงที่เลือก"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/platform">กลับไปแดชบอร์ด</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="เลือกช่วงเวลา">
          {periodPresets.map((preset) => {
            const active = (fromParam || "") === preset.from && (toParam || "") === (preset.to ?? "");
            const qs = new URLSearchParams();
            qs.set("from", preset.from);
            if (preset.to) qs.set("to", preset.to);
            if (selectedShop) qs.set("shop", selectedShop);
            return (
              <Link
                key={preset.key}
                href={`/platform/customers?${qs.toString()}`}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex min-h-[36px] items-center rounded-full border px-3 text-[12px] font-bold",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
          <PeriodPicker from={fromParam || undefined} to={toParam || undefined} shop={selectedShop} />
        </div>
      </div>

      {!insights.hasData ? (
        <EmptyState
          icon={<IconReceipt size={22} aria-hidden="true" />}
          title="ยังไม่มีออเดอร์ในช่วงนี้"
          description="เลือกช่วงเวลาอื่น หรือกดดึงข้อมูลสดจากหน้าแดชบอร์ดก่อน"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="ลูกค้าทั้งหมด"
              value={money(insights.totals.customers)}
              hint={`จาก ${money(insights.totals.orders)} ออเดอร์ · ${insights.periodLabel}`}
            />
            <Kpi
              label="ลูกค้าซื้อซ้ำ"
              value={money(insights.totals.repeatCustomers)}
              hint={`${repeatRate}% ของลูกค้าทั้งหมด`}
            />
            <Kpi label="ยอดซื้อเฉลี่ยต่อคน" value={`฿${money(insights.totals.avgPerCustomer)}`} hint="เฉลี่ยต่อลูกค้า 1 คน" />
            <Kpi label="ยอดซื้อรวม" value={`฿${money(insights.totals.spend)}`} hint="เฉพาะออเดอร์ที่ซื้อจริง" />
          </div>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14.5px] font-bold">ลูกค้าที่ซื้อเยอะที่สุด</h2>
              <Badge variant="secondary">เรียงตามยอดซื้อ</Badge>
            </div>
            <ul className="flex flex-col">
              {insights.topCustomers.map((customer, index) => (
                <CustomerRow
                  key={customer.userId}
                  customer={customer}
                  rank={index + 1}
                  max={maxCustomer}
                />
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padding="padded" className="flex min-w-0 flex-col gap-2">
              <h2 className="text-[14.5px] font-bold">จังหวัดที่ซื้อเยอะที่สุด</h2>
              {insights.topProvinces.length > 0 ? (
                <AreaList rows={insights.topProvinces} max={maxProvince} labelOf={(row) => row.province} />
              ) : (
                <p className="text-[12.5px] text-muted-foreground">ยังไม่มีข้อมูลจังหวัดในช่วงนี้</p>
              )}
            </Card>

            <Card padding="padded" className="flex min-w-0 flex-col gap-2">
              <h2 className="text-[14.5px] font-bold">อำเภอ/เขตที่ซื้อเยอะที่สุด</h2>
              {insights.topDistricts.length > 0 ? (
                <AreaList
                  rows={insights.topDistricts}
                  max={maxDistrict}
                  labelOf={(row) => `${row.district} · ${row.province}`}
                />
              ) : (
                <p className="text-[12.5px] text-muted-foreground">ยังไม่มีข้อมูลอำเภอในช่วงนี้</p>
              )}
            </Card>
          </div>

          <Card variant="info" padding="padded" className="flex flex-col gap-2 text-[12.5px] leading-6">
            <h2 className="text-[13.5px] font-bold">อ่านตัวเลขชุดนี้อย่างไร</h2>
            <ul className="ml-4 list-disc text-muted-foreground">
              <li>
                “ลูกค้าคนเดียว” นับจากบัญชีผู้ซื้อของ TikTok ไม่ใช่ชื่อ — ชื่อที่แสดงถูกปิดบางส่วน
                (เช่น อ***รณ) เพราะออเดอร์ทุกร้านส่งผ่านขนส่งของ TikTok จึงไม่เปิดชื่อ/เบอร์/บ้านเลขที่ให้
              </li>
              <li>จังหวัดกับอำเภอได้มาเต็ม ใช้ดูว่าลูกค้าอยู่พื้นที่ไหนมากที่สุดได้จริง</li>
              <li>
                <strong className="font-bold text-foreground">ไม่มีข้อมูลช่วงอายุหรือเพศ</strong> — TikTok ไม่ได้ส่งข้อมูลนี้มาในคำสั่งซื้อเลย
              </li>
              {insights.totals.anonymousOrders > 0 ? (
                <li>มี {money(insights.totals.anonymousOrders)} ออเดอร์ที่ไม่มีรหัสผู้ซื้อ จึงแยกว่าเป็นลูกค้าคนเดิมไม่ได้</li>
              ) : null}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
