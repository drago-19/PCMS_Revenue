// หน้าข้อมูลลูกค้า — หน้านี้ไม่มีการเคลื่อนไหวโดยตั้งใจ
// เป็นแดชบอร์ดที่อ่านค่าอย่างเดียว (server-rendered) ตัวเลขต้องนิ่งเพื่อให้อ่านเทียบกันได้
// ถ้าเพิ่มอนิเมชันภายหลัง ให้ระบุเหตุผลที่มันช่วยอ่านข้อมูล ไม่ใช่เพื่อความสวย

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { PlatformStat } from "@/components/platform/PlatformCards";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCustomerInsights, type AreaRow, type TopCustomer } from "@/lib/platform/customers";
import { readPlatform } from "@/lib/platform/platforms";
import { thaiRange } from "@/lib/platform/period";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · ลูกค้า" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

/** periodLabel ของฝั่งข้อมูลเป็น ISO — แปลงเป็นวันที่ไทยเพื่อให้อ่านในหน้าเดียวกันได้ */
function thaiPeriodLabel(label: string): string {
  const [from, to] = label.split(" → ");
  return from && to ? thaiRange(from, to) : label;
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

function CustomerRow({
  customer,
  rank,
  max,
  href,
}: {
  customer: TopCustomer;
  rank: number;
  max: number;
  href: string;
}) {
  const place = [customer.district, customer.province].filter(Boolean).join(" · ") || "ไม่ทราบพื้นที่";
  return (
    <li className="flex flex-col gap-1.5 border-b border-slate-200/70 py-3 last:border-b-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="w-5 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">{rank}</span>
          <span className="min-w-0 truncate text-[13.5px] font-bold text-foreground">{customer.name}</span>
        </div>
        <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-[#0d8a47]">฿{money(customer.spend)}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-7 text-[12px] text-muted-foreground">
        <span className="truncate">{place}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{customer.orders} ออเดอร์</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">ล่าสุด {shortDate(customer.lastOrderAt)}</span>
      </div>
      <span className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-[#0d8a47]" style={{ width: `${share(customer.spend, max)}%` }} />
      </span>
      {customer.products.length > 0 ? (
        <p className="ml-7 min-w-0 truncate text-[12px] text-muted-foreground">
          ซื้อ: {customer.products.map((product) => product.name).join(" · ")}
        </p>
      ) : null}
      <Link
        href={href}
        className="ml-7 inline-flex min-h-[32px] w-fit items-center rounded-lg text-[12px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ดูออเดอร์ของลูกค้าคนนี้ →
      </Link>
    </li>
  );
}

function AreaList({
  rows,
  max,
  labelOf,
  hrefOf,
}: {
  rows: AreaRow[];
  max: number;
  labelOf: (row: AreaRow) => string;
  hrefOf: (row: AreaRow) => string;
}) {
  return (
    <ul className="flex list-none flex-col p-0">
      {rows.map((row) => (
        <li key={labelOf(row)} className="flex flex-col gap-1.5 border-b border-slate-200/70 py-2.5 last:border-b-0">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-bold text-foreground">{labelOf(row)}</span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#0d8a47]">฿{money(row.spend)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            <span className="shrink-0 tabular-nums">{row.orders} ออเดอร์</span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 flex-1 tabular-nums">{row.customers} ลูกค้า</span>
          </div>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-[#0d8a47]" style={{ width: `${share(row.spend, max)}%` }} />
          </span>
          <Link
            href={hrefOf(row)}
            className="inline-flex min-h-[30px] w-fit items-center rounded-lg text-[11.5px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ดูออเดอร์ในพื้นที่นี้ →
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const fromParam = read(params, "from");
  const toParam = read(params, "to");
  const selectedShop = read(params, "shop") || undefined;
  const platform = readPlatform(read(params, "platform"));

  const [insights, accounts] = await Promise.all([
    getCustomerInsights({
      from: fromParam || undefined,
      to: toParam || undefined,
      rangeDays: 30,
      shopId: selectedShop,
    }),
    listPlatformAccounts(TIKTOK_PLATFORM),
  ]);

  const maxCustomer = insights.topCustomers[0]?.spend ?? 0;
  const maxProvince = insights.topProvinces[0]?.spend ?? 0;
  const maxDistrict = insights.topDistricts[0]?.spend ?? 0;
  const repeatRate =
    insights.totals.customers > 0
      ? Math.round((insights.totals.repeatCustomers / insights.totals.customers) * 1000) / 10
      : 0;

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="TikTok Shop"
        title="ลูกค้า"
        description="ใครซื้อเยอะที่สุด ซื้ออะไร และอยู่จังหวัด/อำเภอไหน — นับจากออเดอร์ที่ซื้อจริงในช่วงที่เลือก"
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/platform/customers"
        from={fromParam}
        to={toParam}
        shop={selectedShop}
      />

      <PlatformBody platform={platform}>
        <PlatformNav active="customers" from={fromParam} to={toParam} shop={selectedShop} />

        <PlatformPeriodBar
          basePath="/platform/customers"
          from={fromParam || undefined}
          to={toParam || undefined}
          shop={selectedShop}
          accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
        />

        {!insights.hasData ? (
        <EmptyState
          icon={<IconReceipt size={22} aria-hidden="true" />}
          title="ยังไม่มีออเดอร์ในช่วงนี้"
          description="เลือกช่วงเวลาอื่น หรือดึงข้อมูลสดจากหน้าภาพรวมก่อน"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
            <PlatformStat
              label="ลูกค้าทั้งหมด"
              value={money(insights.totals.customers)}
              hint={`จาก ${money(insights.totals.orders)} ออเดอร์ · ${thaiPeriodLabel(insights.periodLabel)}`}
            />
            <PlatformStat
              label="ลูกค้าซื้อซ้ำ"
              value={money(insights.totals.repeatCustomers)}
              hint={`${repeatRate}% ของลูกค้าทั้งหมด`}
            />
            <PlatformStat
              label="ยอดซื้อเฉลี่ยต่อคน"
              value={`฿${money(insights.totals.avgPerCustomer)}`}
              hint="เฉลี่ยต่อลูกค้า 1 คน"
            />
            <PlatformStat label="ยอดซื้อรวม" value={`฿${money(insights.totals.spend)}`} hint="เฉพาะออเดอร์ที่ซื้อจริง" tone="positive" />
          </div>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14.5px] font-bold">ลูกค้าที่ซื้อเยอะที่สุด</h2>
              <Badge variant="neutral">เรียงตามยอดซื้อ</Badge>
            </div>
            <ul className="flex list-none flex-col p-0">
              {insights.topCustomers.map((customer, index) => (
                <CustomerRow
                  key={customer.userId}
                  customer={customer}
                  rank={index + 1}
                  max={maxCustomer}
                  href={hrefWithDetail(
                    "/platform/customers",
                    params,
                    detailParam("customer", customer.userId, customer.name),
                  )}
                />
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padding="padded" className="flex min-w-0 flex-col gap-2">
              <h2 className="text-[14.5px] font-bold">จังหวัดที่ซื้อเยอะที่สุด</h2>
              {insights.topProvinces.length > 0 ? (
                <AreaList
                  rows={insights.topProvinces}
                  max={maxProvince}
                  labelOf={(row) => row.province}
                  hrefOf={(row) =>
                    hrefWithDetail("/platform/customers", params, detailParam("province", row.province ?? "ไม่ระบุ"))
                  }
                />
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
                  hrefOf={(row) =>
                    hrefWithDetail("/platform/customers", params, detailParam("district", row.district ?? "ไม่ระบุ"))
                  }
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
      </PlatformBody>

      <PlatformDetail
        raw={read(params, "detail")}
        basePath="/platform/customers"
        params={params}
        from={fromParam}
        to={toParam}
        shopId={selectedShop}
      />
    </div>
  );
}
