import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloseableDialog } from "@/components/platform/CloseableDialog";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { platformDbName, platformTab, readPlatform } from "@/lib/platform/platforms";
import { syncShopeeStock } from "@/lib/platform/shopee-sync";
import {
  getLastStockSync,
  getSkuDetail,
  getStockCounts,
  getStockMovements,
  getStockPage,
  LOW_STOCK_THRESHOLD,
  syncStock,
  type StockListFilter,
} from "@/lib/platform/stock";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { cn } from "@/lib/utils";
import {
  getActiveShopId,
  getConnectedPlatforms,
  listPlatformAccounts,
} from "@/lib/platform/store";
import { thaiDateTime } from "@/lib/platform/period";
import { PlatformAutoRefresh } from "@/components/PlatformAutoRefresh";
import { StockAdjustForm } from "@/components/platform/StockAdjustForm";
import { StockHoldActions } from "@/components/platform/StockHoldActions";
import { listOpenHolds } from "@/lib/platform/stock-hold";
import { ShopeeStockEditor } from "@/components/ShopeeStockEditor";
import { ShopeeAddProductButton } from "@/components/ShopeeAddProductButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · สต็อก" };

type SearchParams = Promise<{
  platform?: string;
  shop?: string;
  sync?: string;
  page?: string;
  synced?: string;
  changed?: string;
  syncError?: string;
  sku?: string;
  after?: string;
  before?: string;
  q?: string;
  filter?: string;
}>;

const PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 10;

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

export default async function PlatformStockPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const platform = readPlatform(params.platform);
  const dbPlatform = platformDbName(platform);
  const [accounts, connectedPlatforms] = await Promise.all([
    listPlatformAccounts(dbPlatform),
    getConnectedPlatforms(),
  ]);
  // ร้านที่เลือกมาอาจเป็นของแพลตฟอร์มอื่น (เช่นค่าที่ค้างจากแท็บ TikTok)
  // ใช้ได้เฉพาะร้านที่มีอยู่จริงในแพลตฟอร์มนี้ ไม่งั้นถอยไปร้านที่ตั้งไว้หรือร้านแรก
  const requestedShop =
    typeof params.shop === "string" && accounts.some((account) => account.accountKey === params.shop)
      ? params.shop
      : null;
  const shopId =
    requestedShop ?? (await getActiveShopId(dbPlatform)) ?? accounts[0]?.accountKey ?? null;
  const isConnected = connectedPlatforms.includes(platform);

  if (!isConnected) {
    return (
      <div className="workspace-page flex min-w-0 flex-col gap-4">
        <PageHeader
          eyebrow={platformTab(platform).label}
          title="สต็อกของร้านนี้"
          description="ยังไม่มีร้านที่เชื่อมต่อ"
        />
        <PlatformSwitcher
          platform={platform}
          basePath="/platform/stocks"
          shop={params.shop}
          connectedPlatforms={connectedPlatforms}
        />
        <PlatformBody platform={platform} connected={false}>
          <div />
        </PlatformBody>
      </div>
    );
  }

  if (!shopId) {
    return (
      <div className="workspace-page flex min-w-0 flex-col gap-4">
        <PageHeader
          eyebrow={platformTab(platform).label}
          title="สต็อกของร้านนี้"
          description="ยังไม่มีร้านที่เชื่อมต่อ"
        />
        <PlatformSwitcher
          platform={platform}
          basePath="/platform/stocks"
          connectedPlatforms={connectedPlatforms}
        />
        <p className="text-[13px] text-muted-foreground">
          เชื่อมร้าน {platformTab(platform).label} ก่อน แล้วจำนวนสต็อกจะดึงมาแสดงที่นี่
        </p>
      </div>
    );
  }

  // ดึงจริงเฉพาะเมื่อกดปุ่ม (sync=1) แล้วเด้งกลับ URL เดียวกันที่ไม่มี sync
  // เพื่อไม่ให้การรีเฟรชหรือ prefetch ไปดึงซ้ำ
  if (params.sync) {
    let result: { skus: number; changed: number; error?: string };
    if (platform === "shopee") {
      try {
        result = await syncShopeeStock(shopId);
      } catch (err) {
        result = { skus: 0, changed: 0, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      result = await syncStock(shopId);
    }
    const qs = new URLSearchParams({
      shop: shopId,
      synced: String(result.skus),
      changed: String(result.changed),
    });
    if (platform !== "tiktok") qs.set("platform", platform);
    if (result.error) qs.set("syncError", result.error);
    redirect(`/platform/stocks?${qs.toString()}`);
  }

  const syncError = params.syncError ? params.syncError.trim() : null;
  const sync =
    !syncError && params.synced
      ? { skus: Number(params.synced), changed: Number(params.changed ?? 0) }
      : null;
  const pageNumber = Math.max(Number(params.page ?? "1") || 1, 1);

  // ประวัติการเปลี่ยนแปลง: ต่อหน้าด้วย keyset (เวลา|id) ทีละ 10 แถว ไม่ใช้ OFFSET
  const historyBack = Boolean(params.before);
  const [historyTime, historyId] = (params.before || params.after || "").split("|");
  const historyCursor =
    historyTime && historyId ? { changedAt: historyTime, id: historyId, back: historyBack } : undefined;
  // ค้นหา/กรองในฐานข้อมูลตั้งแต่ต้น — ไม่ดึงทุกแถวขึ้นมากรองในหน้าเว็บ
  const search = (params.q ?? "").trim();
  const filter: StockListFilter =
    params.filter === "out" || params.filter === "low" ? params.filter : "all";
  const [list, counts, movements, lastSync, skuDetail] = await Promise.all([
    getStockPage(shopId, { search, filter, page: pageNumber, pageSize: PAGE_SIZE, platform: dbPlatform }),
    getStockCounts(shopId, dbPlatform),
    getStockMovements(shopId, { limit: HISTORY_PAGE_SIZE, cursor: historyCursor, platform: dbPlatform }),
    getLastStockSync(shopId, dbPlatform),
    params.sku ? getSkuDetail(shopId, params.sku, dbPlatform) : Promise.resolve(null),
  ]);
  const pageCount = Math.max(Math.ceil(list.total / PAGE_SIZE), 1);
  const current = Math.min(pageNumber, pageCount);
  const rows =
    current === pageNumber
      ? list.rows
      : (await getStockPage(shopId, { search, filter, page: current, pageSize: PAGE_SIZE, platform: dbPlatform })).rows;

  const totalQty = counts.quantity;
  const inTransit = counts.inTransit;
  const outOfStock = counts.out;
  const shopName = accounts.find((account) => account.accountKey === shopId)?.shopName ?? shopId;
  // ที่กันสต็อกค้างไว้ (ขั้นที่ 2) — เฉพาะร้าน TikTok ที่เชื่อมอยู่
  const heldBySku = platform === "tiktok" && shopId ? await listOpenHolds(shopId) : new Map<string, number>();

  // ลิงก์ที่คงคำค้นและตัวกรองไว้ขณะเปลี่ยนหน้า/ปิดป๊อปอัป
  const listHref = (next: { page?: number; filter?: StockListFilter; q?: string }) => {
    const qs = new URLSearchParams({ shop: shopId });
    if (platform !== "tiktok") qs.set("platform", platform);
    const nextSearch = next.q ?? search;
    const nextFilter = next.filter ?? filter;
    const nextPage = next.page ?? 1;
    if (nextSearch) qs.set("q", nextSearch);
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    if (nextPage > 1) qs.set("page", String(nextPage));
    return `/platform/stocks?${qs.toString()}`;
  };
  const filterTabs: Array<{ key: StockListFilter; label: string; count: number }> = [
    { key: "all", label: "ทั้งหมด", count: counts.all },
    { key: "out", label: "ของหมด", count: counts.out },
    { key: "low", label: `เหลือน้อย ≤${LOW_STOCK_THRESHOLD}`, count: counts.low },
  ];
  const historyHref = (next: { after?: string; before?: string }) => {
    const qs = new URLSearchParams({ shop: shopId });
    if (platform !== "tiktok") qs.set("platform", platform);
    if (current > 1) qs.set("page", String(current));
    if (next.after) qs.set("after", next.after);
    if (next.before) qs.set("before", next.before);
    return `/platform/stocks?${qs.toString()}`;
  };
  const historyCursorOf = (movement: { changedAt: string; id: string }) =>
    `${movement.changedAt}|${movement.id}`;

  const syncParams = new URLSearchParams({ shop: shopId, sync: "1" });
  if (platform !== "tiktok") syncParams.set("platform", platform);

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow={platformTab(platform).label}
        title="สต็อกของร้านนี้"
        description={`จำนวนคงเหลือดึงจาก ${platformTab(platform).label} โดยตรง · ร้าน ${shopName} · อัปเดตล่าสุด ${
          lastSync ? thaiDateTime(lastSync) : "ยังไม่เคยดึง"
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {platform === "shopee" ? <ShopeeAddProductButton accountKey={shopId ?? ""} /> : null}
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/platform/stocks?${syncParams.toString()}`}
                scroll={false}
                prefetch={false}
              >
                ดึงสต็อกล่าสุด
              </Link>
            </Button>
          </div>
        }
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/platform/stocks"
        shop={shopId}
        connectedPlatforms={connectedPlatforms}
      />

      <PlatformNav active="stocks" shop={shopId} platform={platform} />

      <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
        <span>จำนวนคงเหลือดึงจาก {platformTab(platform).label} เข้า DB เราอัตโนมัติ — หน้านี้รีเฟรชตัวเองให้เห็นค่าล่าสุด</span>
        <PlatformAutoRefresh seconds={60} />
      </p>

      {syncError ? (
        <Card variant="danger" padding="padded" className="text-[13px]" role="alert">
          ดึงสต็อกไม่สำเร็จ: {syncError}
        </Card>
      ) : sync ? (
        <p className="rounded-xl border border-[#cfe8da] bg-[#f6fbf8] px-3 py-2 text-[12.5px] text-[#0d6b3c]" role="status">
          ดึงแล้ว {num(sync.skus)} SKU · เปลี่ยนแปลง {num(sync.changed)} รายการ
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
        <StatCard label="SKU ทั้งหมด" value={num(counts.all)} hint={`นับเฉพาะที่มีใน ${platformTab(platform).label}`} />
        <StatCard label="ชิ้นคงเหลือรวม" value={num(totalQty)} tone="positive" hint="รวมทุก SKU ทุกคลัง" />
        <StatCard
          label="สินค้าหมด"
          value={num(outOfStock)}
          tone={outOfStock > 0 ? "negative" : "default"}
          hint="คงเหลือ 0 ชิ้น"
        />
        <StatCard
          label="กำลังตีกลับ"
          value={num(inTransit)}
          hint="ลูกค้าส่งคืนแล้ว แต่ของยังไม่ถึงร้าน"
        />
      </div>

      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">คงเหลือต่อ SKU</h2>
          <Badge variant="neutral">เรียงจากของมากไปน้อย</Badge>
        </div>

        <form action="/platform/stocks" className="flex min-w-0 flex-wrap items-center gap-2">
          {platform !== "tiktok" ? <input type="hidden" name="platform" value={platform} /> : null}
          <input type="hidden" name="shop" value={shopId} />
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className="sr-only" htmlFor="stock-search">
            ค้นหา SKU หรือชื่อสินค้า
          </label>
          <Input
            id="stock-search"
            name="q"
            defaultValue={search}
            placeholder="ค้นหา SKU หรือชื่อสินค้า"
            className="h-10 min-w-0 flex-1 text-[13px]"
          />
          <Button type="submit" size="sm" variant="secondary">
            ค้นหา
          </Button>
          {search ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={listHref({ q: "", filter })} scroll={false}>
                ล้างคำค้น
              </Link>
            </Button>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="กรองตามสถานะสต็อก">
          {filterTabs.map((tab) => {
            const active = tab.key === filter;
            return (
              <Link
                key={tab.key}
                href={listHref({ filter: tab.key })}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {tab.label}
                <span className="tabular-nums opacity-80">{num(tab.count)}</span>
              </Link>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11.5px] text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">รหัส SKU</th>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold">สินค้า</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">คงเหลือรวม</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">กำลังตีกลับ</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-bold">จำนวนคลัง</th>
                <th scope="col" className="py-1.5 text-right font-bold">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.skuId} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2">
                    <Link
                      href={`${listHref({ page: current })}&sku=${encodeURIComponent(row.skuId)}`}
                      scroll={false}
                      className="mono underline underline-offset-2 hover:text-foreground"
                    >
                      {row.sellerSku || row.skuId}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                        ) : null}
                      </span>
                      <span className="max-w-[240px] truncate">{row.productName ?? "—"}</span>
                    </span>
                  </td>
                  <td className={`mono py-1.5 pr-2 text-right font-bold ${row.quantity <= 0 ? "text-[#b42318]" : ""}`}>
                    {num(row.quantity)}
                  </td>
                  <td className={`mono py-1.5 pr-2 text-right ${row.inTransit > 0 ? "font-bold text-[#b54708]" : "text-muted-foreground"}`}>
                    {row.inTransit > 0 ? num(row.inTransit) : "—"}
                  </td>
                  <td className="mono py-1.5 pr-2 text-right text-muted-foreground">{num(row.warehouses.length)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{thaiDateTime(row.updatedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    {search || filter !== "all"
                      ? "ไม่พบ SKU ที่ตรงกับเงื่อนไข — ลองเปลี่ยนคำค้นหรือตัวกรอง"
                      : "ยังไม่มีข้อมูล — กด “ดึงสต็อกล่าสุด” เพื่อดึงจาก TikTok"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span>
            แสดง {num(rows.length)} จาก {num(list.total)} SKU · หน้า {num(current)} / {num(pageCount)}
          </span>
          <span className="flex items-center gap-2">
            {current > 1 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={listHref({ page: current - 1 })} scroll={false}>ก่อนหน้า</Link>
              </Button>
            ) : null}
            {current < pageCount ? (
              <Button asChild size="sm" variant="outline">
                <Link href={listHref({ page: current + 1 })} scroll={false}>ถัดไป</Link>
              </Button>
            ) : null}
          </span>
        </div>
      </Card>

      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">ประวัติการเปลี่ยนแปลง</h2>
          <span className="text-[11.5px] text-muted-foreground">
            {historyCursor ? "ย้อนดูรายการก่อนหน้า" : `${HISTORY_PAGE_SIZE} รายการล่าสุด`} · บันทึกเมื่อยอดจาก TikTok เปลี่ยนระหว่างการดึง
          </span>
        </div>
        {movements.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            ยังไม่มีการเปลี่ยนแปลง — ประวัติจะเริ่มนับตั้งแต่การดึงครั้งแรกเป็นต้นไป
          </p>
        ) : (
          <ul className="flex list-none flex-col p-0">
            {movements.map((movement) => (
              <li
                key={movement.id}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0"
              >
                <span className="mono text-[12.5px] font-bold">{movement.sellerSku ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {movement.productName ?? ""}
                </span>
                <span className="mono text-[12.5px]">
                  {num(movement.fromQty ?? 0)} → <b>{num(movement.toQty)}</b>
                </span>
                <Badge variant={movement.delta > 0 ? "success" : "danger"}>
                  {movement.delta > 0 ? "+" : ""}
                  {num(movement.delta)}
                </Badge>
                <span className="text-[11.5px] text-muted-foreground">{thaiDateTime(movement.changedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        {movements.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>แสดง {num(movements.length)} รายการ</span>
            <span className="flex items-center gap-2">
              {historyCursor ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={historyHref({ before: historyCursorOf(movements[0]) })} scroll={false}>
                    ก่อนหน้า
                  </Link>
                </Button>
              ) : null}
              {movements.length === HISTORY_PAGE_SIZE ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={historyHref({ after: historyCursorOf(movements[movements.length - 1]) })}
                    scroll={false}
                  >
                    ถัดไป
                  </Link>
                </Button>
              ) : null}
            </span>
          </div>
        ) : null}
      </Card>

      <p className="text-[12px] leading-5 text-muted-foreground">
        หมายเหตุ: TikTok อ่านจำนวนอย่างเดียว — การเพิ่ม/ลดจากระบบเรายังต้องรอสิทธิ์ “เขียนสินค้า” (Product write)
        จาก TikTok ก่อน ส่วน Shopee แก้จำนวน ซ่อน และลบสินค้าได้จากช่องรายละเอียดสินค้า แล้วดึงค่ากลับมายืนยัน
        ประวัติจะบันทึกเฉพาะการเปลี่ยนแปลงที่ตรวจพบจากฝั่งแพลตฟอร์ม
      </p>

      {skuDetail ? (
        <CloseableDialog
          closeHref={listHref({ page: current })}
        >
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader className="pr-11">
              <DialogTitle className="text-[16px] leading-6">
                {skuDetail.productName ?? skuDetail.sellerSku ?? "สินค้า"}
              </DialogTitle>
              <p className="text-[12px] leading-5 text-muted-foreground">
                SKU {platform === "shopee" ? "Shopee" : "TikTok"} {skuDetail.sellerSku ?? "—"} · อัปเดต{" "}
                {thaiDateTime(skuDetail.updatedAt)}
              </p>
            </DialogHeader>

            {platform !== "shopee" && skuDetail.productId ? (
              <StockHoldActions
                shopId={shopId ?? ""}
                productId={skuDetail.productId}
                skuId={skuDetail.skuId}
                quantity={skuDetail.quantity}
                inTransit={skuDetail.inTransit}
                held={heldBySku.get(skuDetail.skuId) ?? 0}
                canWrite={isSandboxShopName(shopName)}
                blockedReason="ร้านจริงยังไม่เปิดให้แก้สต็อก — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"
              />
            ) : null}

            {platform !== "shopee" && skuDetail.productId ? (
              <StockAdjustForm
                shopId={shopId}
                productId={skuDetail.productId}
                skuId={skuDetail.skuId}
                quantity={skuDetail.quantity}
                canWrite={isSandboxShopName(shopName)}
                blockedReason="ร้านจริงยังไม่เปิดให้แก้สต็อก — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"
              />
            ) : null}

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {skuDetail.imageUrl ? (
                    <a
                      href={skuDetail.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="เปิดดูรูปสินค้าขนาดเต็ม"
                      className="block size-full"
                    >
                      <img src={skuDetail.imageUrl} alt="" className="size-full object-cover" />
                    </a>
                  ) : null}
                </span>
                <div>
                  <p className="text-[12px] text-muted-foreground">คงเหลือรวม</p>
                  <p className="mono text-[24px] font-bold leading-tight">{num(skuDetail.quantity)}</p>
                </div>
              </div>

              {platform === "shopee" ? (
                <ShopeeStockEditor
                  accountKey={shopId ?? ""}
                  skuId={skuDetail.skuId}
                  quantity={skuDetail.quantity}
                />
              ) : null}

              {skuDetail.warehouses.length > 0 ? (
                <div>
                  <h3 className="text-[13px] font-bold">แยกตามคลัง</h3>
                  <ul className="flex list-none flex-col gap-1 p-0 text-[12.5px]">
                    {skuDetail.warehouses.map((warehouse) => (
                      <li key={warehouse.warehouseId} className="flex justify-between gap-2">
                        <span className="mono text-muted-foreground">{warehouse.warehouseId}</span>
                        <span className="mono font-bold">{num(warehouse.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className="text-[13px] font-bold">ออเดอร์ที่ตัดสต็อก (ล่าสุด)</h3>
                {skuDetail.orders.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">ยังไม่มีออเดอร์ของ SKU นี้ในระบบ</p>
                ) : (
                  <ul className="flex list-none flex-col p-0">
                    {skuDetail.orders.map((order) => (
                      <li
                        key={order.orderId}
                        className="flex flex-wrap items-baseline gap-x-2 border-b border-border/70 py-1.5 text-[12.5px] last:border-0"
                      >
                        <Link
                          href={
                            platform !== "tiktok"
                              ? `/platform/orders?platform=${platform}&order=${encodeURIComponent(order.orderId)}`
                              : `/platform/orders?order=${encodeURIComponent(order.orderId)}`
                          }
                          className="mono underline underline-offset-2"
                        >
                          {order.orderId}
                        </Link>
                        <span className="text-muted-foreground">{thaiDateTime(order.orderedAt)}</span>
                        <span className="ml-auto mono font-bold">−{num(order.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-[13px] font-bold">ประวัติการเปลี่ยนแปลงที่บันทึกไว้</h3>
                {skuDetail.movements.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    ยังไม่มีการเปลี่ยนแปลงที่ตรวจพบ — จะเริ่มบันทึกเมื่อยอดจาก TikTok เปลี่ยน
                  </p>
                ) : (
                  <ul className="flex list-none flex-col p-0">
                    {skuDetail.movements.map((movement, index) => (
                      <li
                        key={`${movement.changedAt}-${index}`}
                        className="flex flex-wrap items-baseline gap-x-2 border-b border-border/70 py-1.5 text-[12.5px] last:border-0"
                      >
                        <span className="text-muted-foreground">{thaiDateTime(movement.changedAt)}</span>
                        <span className="mono">
                          {num(movement.fromQty ?? 0)} → <b>{num(movement.toQty)}</b>
                        </span>
                        <Badge variant={movement.delta > 0 ? "success" : "danger"}>
                          {movement.delta > 0 ? "+" : ""}
                          {num(movement.delta)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DialogContent>
        </CloseableDialog>
      ) : null}
    </div>
  );
}
