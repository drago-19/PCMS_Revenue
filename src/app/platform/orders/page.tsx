import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/PageHeader";
import { IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { listPlatformOrders } from "@/lib/platform/orders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายละเอียดออเดอร์ · TikTok Shop" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TABS = [
  { key: "", label: "ทั้งหมด" },
  { key: "AWAITING_SHIPMENT", label: "รอส่ง" },
  { key: "IN_TRANSIT", label: "กำลังส่ง" },
  { key: "DELIVERED", label: "ส่งถึง" },
  { key: "COMPLETED", label: "สำเร็จ" },
  { key: "CANCELLED", label: "ยกเลิก" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "รอชำระ",
  ON_HOLD: "พักไว้",
  AWAITING_SHIPMENT: "รอส่ง",
  PARTIALLY_SHIPPING: "ส่งบางส่วน",
  AWAITING_COLLECTION: "รอเข้ารับ",
  IN_TRANSIT: "กำลังส่ง",
  DELIVERED: "ส่งถึงแล้ว",
  COMPLETED: "สำเร็จ",
  CANCELLED: "ยกเลิก",
};

function read(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = read(params, "status");
  const search = read(params, "q").trim();
  const shop = read(params, "shop") || undefined;
  const page = Math.max(Number(read(params, "page") || "1") || 1, 1);

  const [config, accounts, result] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
    listPlatformOrders({ shopId: shop, status: status || undefined, search: search || undefined, page, pageSize: 25 }),
  ]);

  const pages = Math.max(Math.ceil(result.total / 25), 1);

  const queryFor = (next: { status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextPage = next.page ?? page;
    if (shop) qs.set("shop", shop);
    if (nextStatus) qs.set("status", nextStatus);
    if (search) qs.set("q", search);
    if (nextPage > 1) qs.set("page", String(nextPage));
    return qs.toString() ? `/platform/orders?${qs.toString()}` : "/platform/orders";
  };

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · จากฐานข้อมูลเรา"
        title="รายละเอียดออเดอร์"
        description="กดที่ออเดอร์เพื่อดูสินค้า ยอดเงิน และสถานะทีละขั้น — ข้อมูลชุดเดียวกับแดชบอร์ด"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/platform">กลับไปแดชบอร์ด</Link>
          </Button>
        }
      />

      {!config.tiktok ? (
        <EmptyState
          icon={<IconReceipt size={22} aria-hidden="true" />}
          title="ยังไม่ได้เชื่อมต่อ TikTok"
          description="เชื่อมร้านก่อน แล้วออเดอร์จะเข้ามาที่นี่"
          action={<Button asChild><Link href="/settings?tab=platforms">ไปที่หน้าตั้งค่า</Link></Button>}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <form action="/platform/orders" className="flex flex-wrap items-center gap-2">
            {shop ? <input type="hidden" name="shop" value={shop} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <label className="sr-only" htmlFor="order-search">
              ค้นหาออเดอร์หรือสินค้า
            </label>
            <input
              id="order-search"
              name="q"
              defaultValue={search}
              placeholder="ค้นหาเลขคำสั่งซื้อ / ชื่อสินค้า / SKU"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px]"
            />
            <Button type="submit" size="sm">
              ค้นหา
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="กรองตามสถานะ">
            {STATUS_TABS.map((tab) => {
              const active = tab.key === status;
              return (
                <Link
                  key={tab.key || "all"}
                  href={queryFor({ status: tab.key, page: 1 })}
                  scroll={false}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "inline-flex min-h-[38px] items-center rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
              <span>{result.total.toLocaleString("th-TH")} ออเดอร์</span>
              <span>
                หน้า {page} / {pages}
              </span>
            </div>

            <ul className="flex list-none flex-col divide-y divide-border p-0">
              {result.rows.map((row) => (
                <li key={row.orderId}>
                  <Link
                    href={`/platform/orders/${encodeURIComponent(row.orderId)}${shop ? `?shop=${encodeURIComponent(shop)}` : ""}`}
                    className="flex min-w-0 flex-col gap-1 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="mono truncate text-[12.5px]">{row.orderId}</span>
                      <Badge variant={row.status === "CANCELLED" ? "destructive" : "outline"}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>{dateTime(row.createTime)}</span>
                      <span>{row.itemCount} รายการ</span>
                      <span className="mono">ยอดสั่ง ฿{money(row.totalAmount)}</span>
                      <span className="mono font-bold text-foreground">โอนจริง ฿{money(row.settlement)}</span>
                    </div>
                    {row.cancelReason ? (
                      <span className="text-[11.5px] text-[#b42318]">ยกเลิก: {row.cancelReason}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>

            {result.rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">ไม่พบออเดอร์ตามเงื่อนไข</p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" asChild={page > 1}>
                {page > 1 ? <Link href={queryFor({ page: page - 1 })}>ก่อนหน้า</Link> : <span>ก่อนหน้า</span>}
              </Button>
              <Button variant="outline" size="sm" asChild={page < pages}>
                {page < pages ? <Link href={queryFor({ page: page + 1 })}>ถัดไป</Link> : <span>ถัดไป</span>}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
