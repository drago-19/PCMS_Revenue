import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { SaleStat } from "@/components/sale/SaleStat";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { CloseableDialog } from "@/components/platform/CloseableDialog";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { parseStamp } from "@/lib/platform/period";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { SaleAutoRefresh } from "@/components/sale/SaleAutoRefresh";
import { SALE_THEME } from "@/lib/sale/theme";
import { IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { platformDbName, platformTab, readPlatform } from "@/lib/platform/platforms";
import {
  getActiveShopId,
  getConnectedPlatforms,
  getPlatformConfig,
  listPlatformAccounts,
} from "@/lib/platform/store";
import {
  countOrdersSinceToday,
  getOrderSummary,
  getPlatformOrder,
  listPlatformOrders,
} from "@/lib/platform/orders";
import { loadOrderTracking } from "@/lib/platform/tracking";
import { CopyButton } from "@/components/CopyButton";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "ฝ่ายขาย · ออเดอร์" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TABS = [
  { key: "", label: "ทั้งหมด" },
  { key: "UNPAID", label: "รอชำระ" },
  { key: "AWAITING_SHIPMENT", label: "รอส่ง" },
  { key: "IN_TRANSIT", label: "กำลังส่ง" },
  { key: "DELIVERED", label: "ส่งถึง" },
  { key: "COMPLETED", label: "สำเร็จ" },
  { key: "CANCELLED", label: "ยกเลิก" },
] as const;

/** ปุ่มที่กำลังเลือกอยู่ — ใช้สีเข้มทึบของสถานะนั้น จะได้ต่างจากปุ่มที่ยังไม่เลือกชัดเจน */
const STATUS_STYLE_ACTIVE: Record<string, string> = {
  UNPAID: "border-[#4338ca] bg-[#4338ca] text-white",
  AWAITING_SHIPMENT: "border-[#b45309] bg-[#b45309] text-white",
  AWAITING_COLLECTION: "border-[#b45309] bg-[#b45309] text-white",
  PARTIALLY_SHIPPING: "border-[#1d4ed8] bg-[#1d4ed8] text-white",
  IN_TRANSIT: "border-[#1d4ed8] bg-[#1d4ed8] text-white",
  DELIVERED: "border-[#047857] bg-[#047857] text-white",
  COMPLETED: "border-[#047857] bg-[#047857] text-white",
  CANCELLED: "border-[#b42318] bg-[#b42318] text-white",
};

/** สีของป้ายสถานะ — แบ่งหมวดให้กวาดตาแล้วรู้ทันที */
const STATUS_STYLE: Record<string, string> = {
  AWAITING_SHIPMENT: "border-[#f0d5a0] bg-[#fef3c7] text-[#7a4b0a]",
  AWAITING_COLLECTION: "border-[#f0d5a0] bg-[#fef3c7] text-[#7a4b0a]",
  PARTIALLY_SHIPPING: "border-[#a9cdf7] bg-[#dbeafe] text-[#1d4ed8]",
  IN_TRANSIT: "border-[#a9cdf7] bg-[#dbeafe] text-[#1d4ed8]",
  DELIVERED: "border-[#a7dfc0] bg-[#dcfce7] text-[#0d6b3c]",
  COMPLETED: "border-[#a7dfc0] bg-[#dcfce7] text-[#0d6b3c]",
  CANCELLED: "border-[#f3b4ae] bg-[#fee2e2] text-[#8a1c14]",
  UNPAID: "border-[#b6c3fb] bg-[#e0e7ff] text-[#3730a3]",
  ON_HOLD: "border-border bg-muted text-muted-foreground",
};

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

/** เวลาแบบมีวินาที — ต้องเห็นวินาทีจึงจะรู้ว่าลิสต์เรียงจากใหม่ไปเก่าจริง */
function dateTime(value: string | null): string {
  const date = parseStamp(value);
  if (!date) return "—";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = read(params, "status");
  // ?pre=1 = เอาเฉพาะออเดอร์ที่มีสินค้าพรีออเดอร์
  const preorderOnly = read(params, "pre") === "1";
  const search = read(params, "q").trim();
  // ไม่ระบุร้าน = ใช้ร้านตามโหมดจริง/ทดสอบที่เลือกไว้
  const shop = read(params, "shop") || (await getActiveShopId("TikTok")) || undefined;
  const fromParam = read(params, "from") || undefined;
  const toParam = read(params, "to") || undefined;
  // keyset: ?after=<เวลา|เลขออเดอร์> เดินหน้า · ?before=... ถอยหลัง (ไม่มี OFFSET แล้ว)
  const afterRaw = read(params, "after");
  const beforeRaw = read(params, "before");
  const back = Boolean(beforeRaw);
  const [cursorTime, cursorId] = (beforeRaw || afterRaw).split("|");
  const cursor = cursorTime && cursorId ? { time: cursorTime, id: cursorId, back } : undefined;
  const platform = readPlatform(read(params, "platform"));
  const dbPlatform = platformDbName(platform);

  const detailId = read(params, "order");
  const filter = {
    platform: dbPlatform,
    shopId: shop,
    status: status || undefined,
    preorder: preorderOnly || undefined,
    search: search || undefined,
    from: fromParam,
    to: toParam,
  };

  const [config, accounts, connectedPlatforms, result, summary, detail, ordersToday] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(dbPlatform),
    getConnectedPlatforms(),
    listPlatformOrders({ ...filter, cursor, pageSize: 25 }),
    getOrderSummary(filter),
    detailId ? getPlatformOrder(detailId, shop, dbPlatform) : Promise.resolve(null),
    countOrdersSinceToday({ platform: dbPlatform, shopId: shop }),
  ]);
  // ชุดข้อมูลที่กำลังดูอยู่ — ใช้ทั้งกับการแจ้งเตือนและป้ายส่วนต่าง (เปลี่ยนชุด = ไม่ใช่ของใหม่)
  const summaryScope = [shop, status, search, fromParam, toParam, preorderOnly ? "pre" : "", afterRaw ?? "", beforeRaw ?? ""].join("|");
  const isAppConfigured = platform === "shopee" ? Boolean(config.shopee) : Boolean(config.tiktok);

  // เหตุการณ์พัสดุแบบละเอียด (ถึงศูนย์คัดแยก/นำส่ง) — ดึงเฉพาะออเดอร์ที่เปิดดูอยู่
  const tracking = detail ? await loadOrderTracking(detail.orderId, detail.shopId ?? shop ?? null) : [];

  const queryFor = (next: {
    status?: string;
    pre?: string;
    after?: string;
    before?: string;
    keepDates?: boolean;
  }) => {
    const qs = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextPre = next.pre ?? (preorderOnly ? "1" : "");
    const keepDates = next.keepDates ?? true;
    if (platform !== "tiktok") qs.set("platform", platform);
    if (shop) qs.set("shop", shop);
    if (nextStatus) qs.set("status", nextStatus);
    if (nextPre) qs.set("pre", nextPre);
    if (search) qs.set("q", search);
    if (keepDates && fromParam) qs.set("from", fromParam);
    if (keepDates && toParam) qs.set("to", toParam);
    if (next.after) qs.set("after", next.after);
    if (next.before) qs.set("before", next.before);
    return qs.toString() ? `/sale/orders?${qs.toString()}` : "/sale/orders";
  };

  // จุดต่อของ keyset: เอาจากแถวแรก/แถวสุดท้ายที่เห็น ไม่ใช้ OFFSET
  const cursorOf = (row: { createTime: string | null; orderId: string } | undefined) =>
    row?.createTime ? `${row.createTime}|${row.orderId}` : "";
  const nextCursor = cursorOf(result.rows[result.rows.length - 1]);
  const prevCursor = cursorOf(result.rows[0]);

  return (
    <div className="workspace-page">
      <SaleHeader
        eyebrow={platformTab(platform).label}
        title="ออเดอร์"
        description="กดที่ออเดอร์เพื่อดูสินค้า ยอดเงิน และสถานะทีละขั้น — ข้อมูลชุดเดียวกับหน้าภาพรวม"
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/sale/orders"
        from={fromParam}
        to={toParam}
        shop={shop}
        connectedPlatforms={connectedPlatforms}
      />

      <PlatformBody platform={platform} connected={connectedPlatforms.includes(platform)}>
      {!isAppConfigured && accounts.length === 0 ? (
        <EmptyState
          icon={<IconReceipt size={22} aria-hidden="true" />}
          title={`ยังไม่ได้เชื่อมต่อ ${platformTab(platform).label}`}
          description="เชื่อมร้านก่อน แล้วออเดอร์จะเข้ามาที่นี่"
          action={<Button asChild><Link href="/settings?tab=platforms">ไปที่หน้าตั้งค่า</Link></Button>}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <form action="/sale/orders" className="flex flex-wrap items-center gap-2">
            {platform !== "tiktok" ? <input type="hidden" name="platform" value={platform} /> : null}
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
            <Button type="submit" size="sm" variant="secondary">
              ค้นหา
            </Button>
          </form>

          <PlatformPeriodBar
            basePath="/sale/orders"
            from={fromParam}
            to={toParam}
            shop={shop}
            platform={platform}
            accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
            extraQuery={{ status, q: search, pre: preorderOnly ? "1" : undefined }}
            autoRefreshSeconds={30}
            refreshNode={<SaleAutoRefresh seconds={30} />}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="กรองตามสถานะ">
              <span className="text-[12.5px] font-bold text-muted-foreground">สถานะ</span>
              {STATUS_TABS.map((tab) => {
                const active = tab.key === status;
                return (
                  <Link
                    key={tab.key || "all"}
                    href={queryFor({ status: tab.key })}
                    scroll={false}
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "inline-flex min-h-[38px] items-center rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                      // สีอ่อน = ยังไม่เลือก · สีเข้มทึบ = ตัวที่เลือกอยู่ (จะได้ไม่เหมือนกัน)
                      active
                        ? (tab.key && STATUS_STYLE_ACTIVE[tab.key]) || "border-slate-900 bg-slate-900 text-white"
                        : (tab.key && STATUS_STYLE[tab.key]) || "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            {/* ตัวกรองพรีออเดอร์: กดซ้ำเพื่อยกเลิก — คงสถานะ/คำค้น/ช่วงวันที่เดิมไว้ */}
            <Link
              href={queryFor({ pre: preorderOnly ? "" : "1" })}
              scroll={false}
              aria-pressed={preorderOnly}
              title="แสดงเฉพาะออเดอร์ที่มีสินค้าพรีออเดอร์"
              className={cn(
                "inline-flex min-h-[40px] items-center rounded-full border px-3 text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                preorderOnly
                  ? "border-[#b45309] bg-[#b45309] text-white"
                  : "border-[#e7c98a] bg-[#fef3c7] text-[#7a5c14] hover:bg-[#fde9b8]",
              )}
            >
              พรีออเดอร์
            </Link>
          </div>

          {/* สรุปตามเงื่อนไขที่กรองอยู่ */}
          {/* สรุปช่วงที่กรองอยู่: ออเดอร์ · ชิ้นรวม · สินค้า (SKU ไม่ซ้ำ) · ยอดโอน */}
          <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-5">
            <SaleStat label="ออเดอร์" value={summary.orders} scopeKey={summaryScope} />
            <SaleStat label="ชิ้นรวม" value={summary.pieces} scopeKey={summaryScope} />
            <SaleStat label="สินค้า (SKU)" value={summary.skus} scopeKey={summaryScope} />
            <SaleStat label="ยอดโอนรวม" value={summary.settlement} format="money" tone="positive" scopeKey={summaryScope} />
            <SaleStat
              label="ยกเลิก"
              value={summary.cancelled}
              tone={summary.cancelled > 0 ? "negative" : "default"}
              scopeKey={summaryScope}
            />
          </div>

          <Card padding="padded" className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
              <span>{result.total.toLocaleString("th-TH")} ออเดอร์</span>
              <span>
                {cursor ? (back ? "ถอยกลับ" : "ต่อจากหน้าถัดไป") : "หน้าแรก"}
              </span>
            </div>

            <ul className="flex list-none flex-col divide-y divide-border p-0">
              {result.rows.map((row) => (
                <li key={row.orderId}>
                  <Link
                    href={`${queryFor({})}&order=${encodeURIComponent(row.orderId)}`.replace(/\?&/, "?").replace(/^\/sale\/orders&/, "/sale/orders?")}
                    scroll={false}
                    className="flex min-w-0 flex-col gap-1 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      {row.firstImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.firstImage}
                          alt={row.firstName ?? "สินค้า"}
                          width={44}
                          height={44}
                          loading="lazy"
                          className="size-11 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <span className="size-11 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
                      )}

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="mono truncate text-[12.5px]">{row.orderId}</span>
                          <CopyButton value={row.orderId} label="คัดลอกเลขคำสั่งซื้อ" />
                          <Badge
                            variant="outline"
                            className={STATUS_STYLE[row.status] ?? "border-border bg-muted text-muted-foreground"}
                          >
                            {STATUS_LABEL[row.status] ?? row.status}
                          </Badge>
                          {row.preorder ? (
                            <Badge variant="outline" className="border-[#e7d9b6] bg-[#fdf8ea] text-[#7a5c14]">
                              พรีออเดอร์
                            </Badge>
                          ) : null}
                        </div>
                        {row.firstName ? (
                          <span className="truncate text-[13px] font-bold">{row.firstName}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>{dateTime(row.createTime)}</span>
                      <span>{row.itemCount} รายการ</span>
                      <span className="mono">ยอดสั่ง ฿{money(row.totalAmount)}</span>
                      <span className="mono font-bold text-foreground">
                        {row.settlement === null
                          ? "รอ TikTok โอน"
                          : `TikTok โอนแล้ว ฿${money(row.settlement)}`}
                      </span>
                    </div>
                    {row.cancelReason && row.status === "CANCELLED" ? (
                      <span className="text-[11.5px] text-[#b42318]">ยกเลิก: {row.cancelReason}</span>
                    ) : null}
                    {row.cancelReason && row.status !== "CANCELLED" ? (
                      <span className="text-[11.5px] text-muted-foreground">
                        มีรายการสินค้าถูกยกเลิก: {row.cancelReason}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>

            {result.rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">ไม่พบออเดอร์ตามเงื่อนไข</p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" asChild={Boolean(prevCursor)}>
                {prevCursor ? (
                  <Link href={queryFor({ before: prevCursor })} scroll={false}>
                    ก่อนหน้า
                  </Link>
                ) : (
                  <span>ก่อนหน้า</span>
                )}
              </Button>
              <Button variant="outline" size="sm" asChild={result.rows.length === 25}>
                {result.rows.length === 25 ? (
                  <Link href={queryFor({ after: nextCursor })} scroll={false}>
                    ถัดไป
                  </Link>
                ) : (
                  <span>ถัดไป</span>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
      </PlatformBody>

      {detail ? (
        <CloseableDialog closeHref={queryFor({})}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" style={SALE_THEME}>
            <DialogHeader className="pr-11">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-[16px]">
                <span className="mono">ออเดอร์ {detail.orderId}</span>
                <CopyButton value={detail.orderId} label="คัดลอกเลขคำสั่งซื้อ" />
              </DialogTitle>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                <span>
                  {detail.items.length} รายการ · ยอดสั่งซื้อ ฿{money(detail.totalAmount)} ·{" "}
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
                {detail.orderType === "PRE_ORDER" ? (
                  <Badge variant="outline" className="border-[#e7d9b6] bg-[#fdf8ea] text-[#7a5c14]">
                    พรีออเดอร์
                    {detail.releaseDate
                      ? ` · เริ่มจัดส่ง ${new Date(detail.releaseDate).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                          timeZone: "Asia/Bangkok",
                        })}`
                      : ""}
                  </Badge>
                ) : null}
              </p>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <ul className="flex list-none flex-col gap-2 p-0">
                {detail.items.map((item, index) => (
                  <li key={`${item.sku ?? "item"}-${index}`} className="flex items-center gap-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={platformImageSrc(item.imageUrl) ?? item.imageUrl}
                        alt={item.name}
                        width={48}
                        height={48}
                        loading="lazy"
                        className="size-12 shrink-0 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="size-12 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold">{item.name}</p>
                      <p className="mono text-[12px] text-muted-foreground">
                        {item.sku ?? "—"} · {item.quantity} ชิ้น · ฿{money(item.price)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">ยอดขาย (revenue)</span>
                  <span className="mono">฿{money(detail.money.revenue)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">ค่าธรรมเนียม/ภาษี</span>
                  <span className="mono text-[#b42318]">฿{money(detail.money.fee)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                  <span className="font-bold">TikTok โอนให้ร้าน</span>
                  <span className="mono font-bold text-[#0d8a47]">
                    {detail.money.statementId ? `฿${money(detail.money.settlement)}` : "รอ TikTok โอน"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                <span>{detail.shippingProvider ?? "—"} · {detail.trackingNumber ?? "ไม่มีเลขพัสดุ"}</span>
                {detail.cancelReason ? (
                  detail.status === "CANCELLED" ? (
                    <span className="text-[#b42318]">ยกเลิก: {detail.cancelReason}</span>
                  ) : detail.cancelUser === "BUYER" ? (
                    <span className="rounded-full bg-[#fffdf6] px-2 py-0.5 text-[#7a4b0a] ring-1 ring-[#f2e3c4]">
                      ผู้ซื้อขอคืนสินค้า: {detail.cancelReason}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      ร้าน/ระบบยกเลิกบางรายการ: {detail.cancelReason}
                    </span>
                  )
                ) : null}
              </div>

              {(() => {
                // ไทม์ไลน์แบบแอปขนส่ง: ใหม่สุดอยู่บน จุดล่าสุดเด่น ที่เหลือเป็นเส้นทางย้อนหลัง
                const steps = (
                  tracking.length > 0
                    ? tracking.map((event) => ({ label: event.description, at: event.eventAt }))
                    : (
                        [
                          { label: "ส่งถึงลูกค้าแล้ว", at: detail.deliveredTime },
                          { label: "ขนส่งรับพัสดุแล้ว", at: detail.collectionTime },
                          { label: "ส่งข้อมูลให้ขนส่ง", at: detail.rtsTime },
                        ] as Array<{ label: string; at: string | null }>
                      ).filter((step): step is { label: string; at: string } => Boolean(step.at))
                );

                if (steps.length === 0) return null;

                return (
                  <ol className="flex list-none flex-col p-0">
                    {steps.map((step, index) => {
                      const latest = index === 0;
                      return (
                        <li key={`${step.label}-${step.at}`} className="flex gap-2.5">
                          <span className="relative flex w-3 shrink-0 justify-center" aria-hidden="true">
                            {index < steps.length - 1 ? (
                              <span className="absolute top-3 bottom-0 w-px bg-border" />
                            ) : null}
                            <span
                              className={cn(
                                "mt-1.5 size-2.5 shrink-0 rounded-full",
                                latest ? "bg-[#0d8a47] ring-4 ring-[#0d8a47]/15" : "bg-border",
                              )}
                            />
                          </span>
                          <span className={index < steps.length - 1 ? "pb-3" : ""}>
                            <span
                              className={cn(
                                "block text-[12.5px] leading-5",
                                latest ? "font-bold text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {step.label}
                            </span>
                            <span className="mono block text-[11px] leading-4 text-muted-foreground">
                              {dateTime(step.at)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                );
              })()}

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={queryFor({})} scroll={false}>
                    ปิด
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        </CloseableDialog>
      ) : null}
    </div>
  );
}
