import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { PlatformStat } from "@/components/platform/PlatformCards";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { CloseableDialog } from "@/components/platform/CloseableDialog";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { parseStamp } from "@/lib/platform/period";
import { IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readPlatform } from "@/lib/platform/platforms";
import { getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { getOrderSummary, getPlatformOrder, listPlatformOrders } from "@/lib/platform/orders";
import { loadOrderTracking } from "@/lib/platform/tracking";
import { CopyButton } from "@/components/CopyButton";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "แพลตฟอร์ม · ออเดอร์" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TABS = [
  { key: "", label: "ทั้งหมด" },
  { key: "AWAITING_SHIPMENT", label: "รอส่ง" },
  { key: "IN_TRANSIT", label: "กำลังส่ง" },
  { key: "DELIVERED", label: "ส่งถึง" },
  { key: "COMPLETED", label: "สำเร็จ" },
  { key: "CANCELLED", label: "ยกเลิก" },
] as const;

/** สีของป้ายสถานะ — แบ่งหมวดให้กวาดตาแล้วรู้ทันที */
const STATUS_STYLE: Record<string, string> = {
  AWAITING_SHIPMENT: "border-[#f5dfae] bg-[#fffbeb] text-[#7a4b0a]",
  AWAITING_COLLECTION: "border-[#f5dfae] bg-[#fffbeb] text-[#7a4b0a]",
  PARTIALLY_SHIPPING: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  IN_TRANSIT: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  DELIVERED: "border-[#bfe6d0] bg-[#f2fbf6] text-[#0d6b3c]",
  COMPLETED: "border-[#bfe6d0] bg-[#f2fbf6] text-[#0d6b3c]",
  CANCELLED: "border-[#f5c2bd] bg-[#fdf3f2] text-[#8a1c14]",
  UNPAID: "border-border bg-muted text-muted-foreground",
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
  const search = read(params, "q").trim();
  const shop = read(params, "shop") || undefined;
  const fromParam = read(params, "from") || undefined;
  const toParam = read(params, "to") || undefined;
  // keyset: ?after=<เวลา|เลขออเดอร์> เดินหน้า · ?before=... ถอยหลัง (ไม่มี OFFSET แล้ว)
  const afterRaw = read(params, "after");
  const beforeRaw = read(params, "before");
  const back = Boolean(beforeRaw);
  const [cursorTime, cursorId] = (beforeRaw || afterRaw).split("|");
  const cursor = cursorTime && cursorId ? { time: cursorTime, id: cursorId, back } : undefined;
  const platform = readPlatform(read(params, "platform"));

  const detailId = read(params, "order");
  const filter = { shopId: shop, status: status || undefined, search: search || undefined, from: fromParam, to: toParam };

  const [config, accounts, result, summary, detail] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
    listPlatformOrders({ ...filter, cursor, pageSize: 25 }),
    getOrderSummary(filter),
    detailId ? getPlatformOrder(detailId, shop) : Promise.resolve(null),
  ]);

  // เหตุการณ์พัสดุแบบละเอียด (ถึงศูนย์คัดแยก/นำส่ง) — ดึงเฉพาะออเดอร์ที่เปิดดูอยู่
  const tracking = detail ? await loadOrderTracking(detail.orderId, detail.shopId ?? shop ?? null) : [];

  const queryFor = (next: { status?: string; after?: string; before?: string; keepDates?: boolean }) => {
    const qs = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const keepDates = next.keepDates ?? true;
    if (shop) qs.set("shop", shop);
    if (nextStatus) qs.set("status", nextStatus);
    if (search) qs.set("q", search);
    if (keepDates && fromParam) qs.set("from", fromParam);
    if (keepDates && toParam) qs.set("to", toParam);
    if (next.after) qs.set("after", next.after);
    if (next.before) qs.set("before", next.before);
    return qs.toString() ? `/platform/orders?${qs.toString()}` : "/platform/orders";
  };

  // จุดต่อของ keyset: เอาจากแถวแรก/แถวสุดท้ายที่เห็น ไม่ใช้ OFFSET
  const cursorOf = (row: { createTime: string | null; orderId: string } | undefined) =>
    row?.createTime ? `${row.createTime}|${row.orderId}` : "";
  const nextCursor = cursorOf(result.rows[result.rows.length - 1]);
  const prevCursor = cursorOf(result.rows[0]);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop"
        title="ออเดอร์"
        description="กดที่ออเดอร์เพื่อดูสินค้า ยอดเงิน และสถานะทีละขั้น — ข้อมูลชุดเดียวกับหน้าภาพรวม"
      />

      <PlatformSwitcher platform={platform} basePath="/platform/orders" from={fromParam} to={toParam} shop={shop} />

      <PlatformBody platform={platform}>
      <PlatformNav active="orders" from={fromParam} to={toParam} shop={shop} />

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
            <Button type="submit" size="sm" variant="secondary">
              ค้นหา
            </Button>
          </form>

          <PlatformPeriodBar
            basePath="/platform/orders"
            from={fromParam}
            to={toParam}
            shop={shop}
            accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
            extraQuery={{ status, q: search }}
            autoRefreshSeconds={30}
          />

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

          {/* สรุปตามเงื่อนไขที่กรองอยู่ */}
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
            <PlatformStat label="ออเดอร์" value={summary.orders.toLocaleString("th-TH")} />
            <PlatformStat label="ยอดโอนรวม" value={`฿${money(summary.settlement)}`} tone="positive" />
            <PlatformStat
              label="ยกเลิก"
              value={summary.cancelled.toLocaleString("th-TH")}
              tone={summary.cancelled > 0 ? "negative" : "default"}
            />
            <PlatformStat label="รายการสินค้า" value={summary.items.toLocaleString("th-TH")} />
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
                    href={`${queryFor({})}&order=${encodeURIComponent(row.orderId)}`.replace(/\?&/, "?").replace(/^\/platform\/orders&/, "/platform/orders?")}
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
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="pr-11">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-[16px]">
                <span className="mono">ออเดอร์ {detail.orderId}</span>
                <CopyButton value={detail.orderId} label="คัดลอกเลขคำสั่งซื้อ" />
              </DialogTitle>
              <p className="text-[13px] text-muted-foreground">
                {detail.items.length} รายการ · ยอดสั่งซื้อ ฿{money(detail.totalAmount)} ·{" "}
                {STATUS_LABEL[detail.status] ?? detail.status}
              </p>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <ul className="flex list-none flex-col gap-2 p-0">
                {detail.items.map((item, index) => (
                  <li key={`${item.sku ?? "item"}-${index}`} className="flex items-center gap-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
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
