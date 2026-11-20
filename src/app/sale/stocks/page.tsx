import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { SaleStat } from "@/components/sale/SaleStat";
import { SaleStockDetailDialog } from "@/components/sale/SaleStockDetailDialog";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { platformDbName, platformTab, readPlatform } from "@/lib/platform/platforms";
import { syncShopeeStock } from "@/lib/platform/shopee-sync";
import {
  getLastStockSync,
  getStockCounts,
  getStockChangeStats,
  getStockMovements,
  getStockPage,
  getProductStockTotals,
  listRecentStockChanges,
  LOW_STOCK_THRESHOLD,
  syncStock,
  productStatusLabel,
  type StockListFilter,
} from "@/lib/platform/stock";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { CloseableDialog } from "@/components/platform/CloseableDialog";
import { TableLoadingBoundary } from "@/components/TableLoadingBoundary";
import { groupStockRows, variantHint, variantLabel, type StockListGroup } from "@/lib/platform/stock-list";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SALE_THEME } from "@/lib/sale/theme";
import { cn } from "@/lib/utils";
import {
  getActiveShopId,
  getConnectedPlatforms,
  listPlatformAccounts,
} from "@/lib/platform/store";
import { thaiDateTime } from "@/lib/platform/period";
import { SaleAutoRefresh } from "@/components/sale/SaleAutoRefresh";
// ฟอร์มชื่อ/รูป/สต็อกของป๊อปอัปย้ายไปอยู่ใน SaleStockDetailDialog (ใช้สำเนาฝั่ง sale)
import { LiveRefresh } from "@/components/sale/LiveRefresh";
import { centralStockForShop, reconcileCentralStock } from "@/lib/stock/central";

export const dynamic = "force-dynamic";

export const metadata = { title: "ฝ่ายขาย · สต็อก" };

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
  history?: string;
}>;

const PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 10;

function num(value: number): string {
  return value.toLocaleString("th-TH");
}

/** ราคาเป็นบาทเป็นค่าเริ่มต้นของร้าน — สกุลอื่นแสดงนำหน้าตามที่แพลตฟอร์มส่งมา */
function priceText(price: number | null, currency: string | null): string {
  if (price === null) return "—";
  const symbol = !currency || currency === "THB" ? "฿" : `${currency} `;
  return `${symbol}${num(price)}`;
}

/** ราคาเดียวเมื่อทุกไซส์เท่ากัน · เป็นช่วงเมื่อแต่ละไซส์ไม่เท่ากัน */
function priceRangeText(range: { min: number; max: number } | null, currency: string | null): string {
  if (!range) return "—";
  if (range.min === range.max) return priceText(range.min, currency);
  return `${num(range.min)}–${priceText(range.max, currency)}`;
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
        <SaleHeader
          eyebrow={platformTab(platform).label}
          title="สต็อกของร้านนี้"
          description="ยังไม่มีร้านที่เชื่อมต่อ"
        />
        <PlatformSwitcher
          platform={platform}
          basePath="/sale/stocks"
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
        <SaleHeader
          eyebrow={platformTab(platform).label}
          title="สต็อกของร้านนี้"
          description="ยังไม่มีร้านที่เชื่อมต่อ"
        />
        <PlatformSwitcher
          platform={platform}
          basePath="/sale/stocks"
          connectedPlatforms={connectedPlatforms}
        />
        <p className="text-[13px] text-muted-foreground">
          เชื่อมร้าน {platformTab(platform).label} ก่อน แล้วจำนวนสต็อกจะดึงมาแสดงที่นี่
          {" · "}ถ้าเชื่อมไว้แล้วแต่ไม่เห็นร้าน ร้านนั้นถูกซ่อนอยู่ — เปิดกลับได้ที่หน้าตั้งค่า
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
    // หักยอดขายเข้าสต็อกกลางทันทีหลังดึงสต็อก — ไม่ต้องรอรอบนาทีถัดไป
    await reconcileCentralStock({ hours: 48 }).catch(() => undefined);
    const qs = new URLSearchParams({
      shop: shopId,
      synced: String(result.skus),
      changed: String(result.changed),
    });
    if (platform !== "tiktok") qs.set("platform", platform);
    if (result.error) qs.set("syncError", result.error);
    redirect(`/sale/stocks?${qs.toString()}`);
  }

  const syncError = params.syncError ? params.syncError.trim() : null;
  const sync =
    !syncError && params.synced
      ? { skus: Number(params.synced), changed: Number(params.changed ?? 0) }
      : null;
  const pageNumber = Math.max(Number(params.page ?? "1") || 1, 1);
  // ป๊อปอัป "ประวัติเปลี่ยนแปลง" เปิดด้วย ?history=1 (ใช้รูปแบบเดียวกับป๊อปอัปอื่นของหน้านี้)
  const historyOpen = params.history === "1";

  // ประวัติการเปลี่ยนแปลง: ต่อหน้าด้วย keyset (เวลา|id) ทีละ 10 แถว ไม่ใช้ OFFSET
  const historyBack = Boolean(params.before);
  const [historyTime, historyId] = (params.before || params.after || "").split("|");
  const historyCursor =
    historyTime && historyId ? { changedAt: historyTime, id: historyId, back: historyBack } : undefined;
  // ค้นหา/กรองในฐานข้อมูลตั้งแต่ต้น — ไม่ดึงทุกแถวขึ้นมากรองในหน้าเว็บ
  const search = (params.q ?? "").trim();
  const filter: StockListFilter =
    params.filter === "out" ||
    params.filter === "low" ||
    params.filter === "open" ||
    params.filter === "hidden" ||
    params.filter === "deleted"
      ? params.filter
      : "all";
  // ป๊อปอัปรายละเอียดเป็นแบบอ่านอย่างเดียวแล้ว — ไม่มีโหมดปรับสต็อก/แก้ไขสินค้าให้เลือกจาก URL
  // สถานะผิดพลาด: อ่านข้อมูลไม่สำเร็จ (ฐานข้อมูลล่ม/ตารางถูกล็อก) ต้องเห็นเป็นข้อความ ไม่ใช่หน้าจอขาว
  let loadError: string | null = null;
  const view = await Promise.all([
    getStockPage(shopId, { search, filter, page: pageNumber, pageSize: PAGE_SIZE, platform: dbPlatform }),
    getStockCounts(shopId, dbPlatform),
    getStockMovements(shopId, { limit: HISTORY_PAGE_SIZE, cursor: historyCursor, platform: dbPlatform }),
    getLastStockSync(shopId, dbPlatform),
    getStockChangeStats({ shopId, platform: dbPlatform }),
    historyOpen ? listRecentStockChanges({ shopId, platform: dbPlatform, minutes: 30, limit: 100 }) : Promise.resolve([]),
  ]).catch((error: unknown) => {
    loadError = error instanceof Error ? error.message : String(error);
    return null;
  });

  if (!view) {
    return (
      <div className="workspace-page flex min-w-0 flex-col gap-4">
        <SaleHeader
          eyebrow={platformTab(platform).label}
          title="สต็อกของร้านนี้"
          description="อ่านข้อมูลร้านไม่สำเร็จ"
        />
        <Card variant="danger" padding="padded" className="flex min-w-0 flex-col items-start gap-3 text-[13px]" role="alert">
          <p className="font-bold">โหลดรายการสต็อกไม่สำเร็จ</p>
          <p className="text-[12px] leading-5">ข้อมูลจาก {platformTab(platform).label} ยังอยู่ในฐานข้อมูล — ลองโหลดหน้าใหม่แล้วจึงกด “ดึงสต็อกล่าสุด” อีกครั้ง</p>
          <p className="mono max-w-full break-words text-[11.5px] opacity-80">รายละเอียด: {loadError}</p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/sale/stocks?shop=${encodeURIComponent(shopId)}`}>ลองโหลดใหม่</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const [list, counts, movements, lastSync, changeStats, recentChanges] = view;
  // สต็อกกลาง: ยอดเดียวกันนี้ใช้ร่วมทุกแพลตฟอร์มและทุกร้านที่ผูกไว้ (ไม่ใช่ยอดของร้านนี้)
  const centralBySku = await centralStockForShop(dbPlatform, shopId);
  const pageCount = Math.max(Math.ceil(list.total / PAGE_SIZE), 1);
  const current = Math.min(pageNumber, pageCount);
  const rows =
    current === pageNumber
      ? list.rows
      : (await getStockPage(shopId, { search, filter, page: current, pageSize: PAGE_SIZE, platform: dbPlatform })).rows;

  // จัดกลุ่มแบบหน้า "สินค้า" ของ Shipnity: สินค้า 1 ตัวเป็นแถวหลัก ไซส์เป็นแถวลูกอยู่ใต้กัน
  // แถวหลักใช้ยอดรวมของทุกไซส์ (ถามฐานข้อมูลครั้งเดียวสำหรับสินค้าที่อยู่ในหน้านี้)
  // เพราะบางสินค้ามีไซส์มากกว่าที่แสดงในหน้านี้
  const productTotals = await getProductStockTotals(
    shopId,
    [...new Set(rows.map((row) => row.productId).filter((id): id is string => Boolean(id)))],
    dbPlatform,
  );
  const groups = groupStockRows(rows, productTotals);

  // ชุดข้อมูลที่กำลังดูอยู่ — ใช้ทั้งกับการแจ้งเตือนและป้ายส่วนต่าง
  const stockScope = [shopId ?? "", platform, search, filter, params.page ?? ""].join("|");
  const totalQty = counts.quantity;
  const inTransit = counts.inTransit;
  const outOfStock = counts.out;
  const shopName = accounts.find((account) => account.accountKey === shopId)?.shopName ?? shopId;
  // เปิดให้เขียนบนร้านจริงหรือยัง — ด่านเดียวกับฝั่งเซิร์ฟเวอร์ (stock-write.ts)
  // ถ้าเปิดแล้วปุ่มต้องกดได้บนร้านจริง ไม่ใช่เทาค้างเพราะชื่อร้านไม่ขึ้นต้นด้วย SANDBOX_
  const liveStockWrite = process.env.PLATFORM_STOCK_WRITE_LIVE === "1";

  // ลิงก์ที่คงคำค้นและตัวกรองไว้ขณะเปลี่ยนหน้า/ปิดป๊อปอัป
  const listHref = (next: { page?: number; filter?: StockListFilter; q?: string; history?: string; shop?: string }) => {
    const qs = new URLSearchParams({ shop: next.shop ?? shopId });
    if (platform !== "tiktok") qs.set("platform", platform);
    const nextSearch = next.q ?? search;
    const nextFilter = next.filter ?? filter;
    const nextPage = next.page ?? 1;
    if (nextSearch) qs.set("q", nextSearch);
    if (nextFilter !== "all") qs.set("filter", nextFilter);
    if (nextPage > 1) qs.set("page", String(nextPage));
    if (next.history) qs.set("history", next.history);
    return `/sale/stocks?${qs.toString()}`;
  };
  const filterTabs: Array<{ key: StockListFilter; label: string; count: number; tone?: "open" | "hidden" }> = [
    { key: "all", label: "ทั้งหมด", count: counts.all },
    { key: "open", label: "เปิดตะกร้า", count: counts.open, tone: "open" },
    { key: "hidden", label: "ซ่อนตะกร้า", count: counts.hidden, tone: "hidden" },
    { key: "deleted", label: "ไม่พร้อมขาย", count: counts.deleted },
    { key: "out", label: "ของหมดบนร้าน", count: counts.out },
    { key: "low", label: `เหลือน้อยบนร้าน ≤${LOW_STOCK_THRESHOLD}`, count: counts.low },
  ];
  const historyHref = (next: { after?: string; before?: string }) => {
    const qs = new URLSearchParams({ shop: shopId });
    if (platform !== "tiktok") qs.set("platform", platform);
    if (current > 1) qs.set("page", String(current));
    if (next.after) qs.set("after", next.after);
    if (next.before) qs.set("before", next.before);
    return `/sale/stocks?${qs.toString()}`;
  };
  const historyCursorOf = (movement: { changedAt: string; id: string }) =>
    `${movement.changedAt}|${movement.id}`;
  // เปิดป๊อปอัปของรหัสย่อยนั้น — ป๊อปอัปเป็นแบบอ่านอย่างเดียว
  const detailHref = (skuId: string) => `${listHref({ page: current })}&sku=${encodeURIComponent(skuId)}`;
  /** สต็อกกลางของกลุ่ม = ผลรวมเฉพาะรหัสที่ผูกไว้ · null เมื่อยังไม่มีรหัสไหนผูก */
  const centralTotalOf = (skus: StockListGroup["skus"]): number | null => {
    const linked = skus.filter((sku) => centralBySku.has(sku.skuId));
    if (linked.length === 0) return null;
    return linked.reduce((sum, sku) => sum + (centralBySku.get(sku.skuId)?.onHand ?? 0), 0);
  };

  const syncParams = new URLSearchParams({ shop: shopId, sync: "1" });
  if (platform !== "tiktok") syncParams.set("platform", platform);

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <SaleHeader
        eyebrow={platformTab(platform).label}
        title="สต็อกของร้านนี้"
        description={`จำนวนคงเหลือดึงจาก ${platformTab(platform).label} โดยตรง · ร้าน ${shopName} · เปลี่ยนแปลงล่าสุด ${
          lastSync ? thaiDateTime(lastSync) : "ยังไม่เคยดึง"
        }`}
      />

      {/* ออเดอร์/สต็อกขยับทุก ~15–30 วิ — หน้าจอตามให้เองโดยไม่ต้องกดรีเฟรช */}
      <LiveRefresh />

      <PlatformSwitcher
        platform={platform}
        basePath="/sale/stocks"
        shop={shopId}
        connectedPlatforms={connectedPlatforms}
        tones="platform"
      />

      {/* ตัวเลือกร้าน: หน้านี้เดิมแสดงเฉพาะร้านที่ตั้งเป็นค่าใช้งาน ต้องไปสลับที่หน้าตั้งค่า */}
      {accounts.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="เลือกร้าน">
          <span className="text-[12px] font-bold text-muted-foreground">ร้าน:</span>
          {accounts.map((account) => {
            const active = account.accountKey === shopId;
            const sandbox = isSandboxShopName(account.shopName);
            return (
              <Link
                key={account.accountKey}
                href={listHref({ shop: account.accountKey, page: 1 })}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {account.shopName}
                {sandbox ? (
                  <span
                    className={cn(
                      "rounded px-1 text-[10px]",
                      active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700",
                    )}
                  >
                    ทดสอบ
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}

      <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
        <span>จำนวนคงเหลือดึงจาก {platformTab(platform).label} เข้า DB เราอัตโนมัติ — หน้านี้รีเฟรชตัวเองให้เห็นค่าล่าสุด</span>
        <SaleAutoRefresh seconds={30} />
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
        <SaleStat label="SKU ทั้งหมด" value={counts.all} scopeKey={stockScope} hint={`นับเฉพาะที่มีใน ${platformTab(platform).label}`} />
        <SaleStat
          label="ชิ้นคงเหลือบนร้าน"
          value={totalQty}
          tone="positive"
          scopeKey={stockScope}
          hint="เฉพาะร้านที่เลือก — ยอดที่ใช้ร่วมทุกช่องทางดูคอลัมน์ «สต็อกกลาง»"
        />
        <SaleStat
          label="สินค้าหมด"
          value={outOfStock}
          tone={outOfStock > 0 ? "negative" : "default"}
          scopeKey={stockScope}
          hint="คงเหลือ 0 ชิ้น"
        />
        <SaleStat
          label="กำลังตีกลับ"
          value={inTransit}
          scopeKey={stockScope}
          hint="ลูกค้าส่งคืนแล้ว แต่ของยังไม่ถึงร้าน"
        />
      </div>


      <Card padding="padded" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold">คงเหลือต่อ SKU</h2>
          <Badge variant="neutral">เรียงจากของมากไปน้อย</Badge>
        </div>
        {/* อธิบายยอดแต่ละคอลัมน์ให้คนที่ย้ายมาจาก Shipnity — ยอดไหนสุทธิแล้ว ยอดไหนรวม */}
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          <b>คงเหลือ (ขายได้)</b> = ยอดที่ {platformTab(platform).label} ส่งมา ซึ่งตัดออเดอร์ที่ยังไม่ส่งไปแล้ว
          {" · "}
          <b>จอง</b> = ชิ้นที่อยู่ในออเดอร์ซึ่งร้านยังไม่ส่ง (อยู่ในยอดคงเหลือแล้ว จึงไม่ลบซ้ำ)
          {" · "}
          <b>รวมในมือ</b> = คงเหลือ (ขายได้) + จอง — ใช้เทียบกับยอดใน Shipnity
        </p>

        <form action="/sale/stocks" className="flex min-w-0 flex-wrap items-center gap-2">
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

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="กรองตามสถานะสต็อก">
          {filterTabs.map((tab) => {
            const active = tab.key === filter;
            return (
              <span key={tab.key} className="contents">
                {tab.key === "out" ? (
                  <span aria-hidden className="mx-0.5 h-5 w-px self-center bg-border" />
                ) : null}
                <Link
                  href={listHref({ filter: tab.key })}
                  scroll={false}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                    active
                      ? tab.tone === "open"
                        ? "border-[color:var(--ok)] bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                        : tab.tone === "hidden"
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : "border-slate-900 bg-slate-900 text-white"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab.tone === "open" ? (
                    <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--ok)]" />
                  ) : tab.tone === "hidden" ? (
                    <span aria-hidden className="size-1.5 rounded-full bg-rose-400" />
                  ) : null}
                  {tab.label}
                  <span className="tabular-nums opacity-80">{num(tab.count)}</span>
                </Link>
              </span>
            );
          })}
          </div>

          {/* ปุ่มงานหลักเรียงกันทางขวาของแถวตัวกรอง — ดึงสต็อกล่าสุด · ประวัติ */}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/sale/stocks?${syncParams.toString()}`} scroll={false} prefetch={false}>
                ดึงสต็อกล่าสุด
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link
                href={listHref({ history: "1" })}
                scroll={false}
                className="gap-2"
                title="การเคลื่อนไหวสต็อกในรอบ 5 นาทีล่าสุด — กดเพื่อดูรายการ 30 นาทีล่าสุด"
              >
              ประวัติเปลี่ยนแปลง
              {changeStats.changes > 0 ? (
                <span className="flex items-center gap-1 text-[11.5px] font-bold">
                  {changeStats.added > 0 ? (
                    <span style={{ color: "var(--ok)" }}>+{changeStats.added}</span>
                  ) : null}
                  {changeStats.removed < 0 ? (
                    <span style={{ color: "var(--danger)" }}>{changeStats.removed}</span>
                  ) : null}
                  <span className="text-muted-foreground">· {changeStats.changes} รายการ</span>
                </span>
                ) : null}
              </Link>
            </Button>
          </div>
        </div>
        {/* งานสร้างสินค้าและปรับสต็อกย้ายไปหน้าสต็อกกลางแล้ว — หน้านี้เหลือดูประกาศกับสวิตช์ตะกร้า */}
        <p className="text-[12px] leading-5 text-muted-foreground">
          หน้านี้ใช้ดูประกาศบนแพลตฟอร์มและเปิด/ปิดตะกร้าเท่านั้น — ปรับสต็อกและเพิ่มสินค้าทำที่<Link href="/sale/central-stock" className="font-bold underline underline-offset-2">หน้าสต็อกกลาง</Link>
        </p>
        <TableLoadingBoundary rows={8} columns={6} label="กำลังโหลดรายการสต็อก">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {search || filter !== "all"
                ? "ไม่พบ SKU ที่ตรงกับเงื่อนไข — ลองเปลี่ยนคำค้นหรือตัวกรอง"
                : "ยังไม่มีข้อมูล — กด “ดึงสต็อกล่าสุด” เพื่อดึงจาก TikTok"}
            </p>
          ) : (
            <>
              {/* จอใหญ่: สินค้าเป็นแถวหลัก · ไซส์ของสินค้าเป็นแถวลูกอยู่ใต้กัน */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <tr className="border-b border-[color:var(--foreground)]/25 text-[11.5px] font-semibold text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-2 text-left font-bold">สินค้า / รหัสย่อย</th>
                      <th
                        scope="col"
                        className="py-1.5 pr-2 text-right font-bold"
                        title={`ราคาที่ประกาศขายอยู่บน ${platformTab(platform).label} — ดึงมาจากประกาศโดยตรง ไม่ใช่ราคาที่บันทึกไว้ในระบบเรา`}
                      >
                        ราคาบน {platformTab(platform).label}
                      </th>
                      <th
                        scope="col"
                        className="py-1.5 pr-2 text-right font-bold"
                        title={`คงเหลือ (ขายได้) = ยอดที่ ${platformTab(platform).label} ส่งมา ซึ่งตัดออเดอร์ที่ยังไม่ส่งไปแล้ว — ไม่ได้ลบยอดจองซ้ำ`}
                      >
                        คงเหลือ (ขายได้)
                      </th>
                      <th
                        scope="col"
                        className="py-1.5 pr-2 text-right font-bold"
                        title="จอง = ชิ้นที่อยู่ในออเดอร์ซึ่งร้านยังไม่ส่ง · ยอดนี้ถูกรวมอยู่ในคอลัมน์ «คงเหลือ (ขายได้)» แล้ว"
                      >
                        จอง
                      </th>
                      <th
                        scope="col"
                        className="py-1.5 pr-2 text-right font-bold"
                        title="รวมในมือ = คงเหลือ (ขายได้) + จอง · ใช้เทียบกับยอดใน Shipnity"
                      >
                        รวมในมือ
                      </th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-bold">สต็อกกลาง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      // สินค้าที่มีรหัสย่อยเดียว: ตัวเลขบนแถวหลักคือของรหัสนั้น กดชื่อเพื่อเปิดรายละเอียดได้
                      const single = group.skus.length === 1 ? group.skus[0] : null;
                      const centralTotal = centralTotalOf(group.skus);
                      return (
                        <Fragment key={group.key}>
                          <tr className="border-b border-border bg-muted/30">
                            <td className="py-2 pr-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                                  {group.imageUrl ? (
                                    <img src={platformImageSrc(group.imageUrl) ?? group.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                                  ) : null}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {single ? (
                                      <Link
                                        href={detailHref(single.skuId)} data-stock-sku={single.skuId}
                                        scroll={false}
                                        className="max-w-[260px] truncate font-bold underline underline-offset-2"
                                      >
                                        {group.productName ?? "—"}
                                      </Link>
                                    ) : (
                                      <span className="max-w-[260px] truncate font-bold">{group.productName ?? "—"}</span>
                                    )}
                                    <span
                                      className={cn(
                                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
                                        group.productStatus === "ACTIVATE"
                                          ? "bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                                          : "bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {productStatusLabel(group.productStatus)}
                                    </span>
                                  </div>
                                  <p className="truncate text-[11.5px] text-muted-foreground">
                                    {single ? (
                                      <span className="mono">{single.sellerSku || single.skuId}</span>
                                    ) : (
                                      <>
                                        รวมทั้งสินค้า {num(group.skuTotal)} ไซส์
                                        {group.skus.length < group.skuTotal
                                          ? ` · หน้านี้แสดง ${num(group.skus.length)}`
                                          : ""}
                                      </>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="mono py-2 pr-2 text-right font-bold">
                              {priceRangeText(group.price, group.currency)}
                            </td>
                            {/* ผลรวมแต่ละคอลัมน์: คงเหลือ (ขายได้) · จอง · รวมในมือ */}
                            <td
                              className={cn(
                                "mono py-2 pr-2 text-right font-bold",
                                group.totalAvailable < 0 && "text-[#b42318]",
                              )}
                              title={group.totalAvailable < 0 ? "ยอดติดลบตามที่แพลตฟอร์มส่งมา — ตรวจเทียบกับ Shipnity" : undefined}
                            >
                              {num(group.totalAvailable)}
                            </td>
                            <td className="mono py-2 pr-2 text-right">{num(group.totalReserved)}</td>
                            <td className={cn("mono py-2 pr-2 text-right", group.totalOnHand < 0 && "text-[#b42318]")}>
                              {num(group.totalOnHand)}
                            </td>
                            <td className="mono py-2 pr-2 text-right">
                              {centralTotal === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className={cn("font-bold", centralTotal <= 0 && "text-[#b42318]")}>{num(centralTotal)}</span>
                              )}
                            </td>
                          </tr>

                          {/* แถวลูก: รหัสย่อย (ไซส์) — สต็อก · จอง · คงเหลือ ของรหัสนั้น */
                          group.skus.length > 1
                            ? group.skus.map((sku) => (
                                <tr key={sku.skuId} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                                  <td className="py-1.5 pr-2">
                                    <Link
                                      href={detailHref(sku.skuId)} data-stock-sku={sku.skuId}
                                      scroll={false}
                                      className="flex min-w-0 items-center gap-1.5 pl-4"
                                    >
                                      <span aria-hidden="true" className="text-muted-foreground">↳</span>
                                      <span className="mono truncate font-bold underline underline-offset-2">
                                        {sku.sellerSku || sku.skuId}
                                      </span>
                                      <span
                                        className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground"
                                        title={variantHint(sku.variantName, sku.sellerSku) ?? undefined}
                                      >
                                        {variantLabel(sku.variantName, sku.sellerSku)}
                                      </span>
                                    </Link>
                                  </td>
                                  <td className="mono py-1.5 pr-2 text-right">{priceText(sku.price, sku.currency)}</td>
                                  <td
                                    className={cn(
                                      "mono py-1.5 pr-2 text-right font-bold",
                                      sku.available < 0 && "text-[#b42318]",
                                    )}
                                    title={sku.available < 0 ? "คงเหลือติดลบตามที่แพลตฟอร์มส่งมา — ตรวจเทียบกับ Shipnity" : undefined}
                                  >
                                    {num(sku.available)}
                                  </td>
                                  <td className="mono py-1.5 pr-2 text-right">{num(sku.reserved)}</td>
                                  <td className={cn("mono py-1.5 pr-2 text-right", sku.onHand < 0 && "text-[#b42318]")}>
                                    {num(sku.onHand)}
                                  </td>
                                  <td className="mono py-1.5 pr-2 text-right">
                                    {centralBySku.has(sku.skuId) ? (
                                      <span
                                        className={cn(
                                          "font-bold",
                                          (centralBySku.get(sku.skuId)?.onHand ?? 0) <= 0 && "text-[#b42318]",
                                        )}
                                        title={`รหัสกลาง ${centralBySku.get(sku.skuId)?.skuCode}`}
                                      >
                                        {num(centralBySku.get(sku.skuId)?.onHand ?? 0)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* จอมือถือ (360px): การ์ดต่อสินค้า — ความกว้างยืดตามจอ ไม่มีการเลื่อนแนวนอน */}
              <div className="flex min-w-0 flex-col gap-2.5 md:hidden">
                {groups.map((group) => (
                  <div key={group.key} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {group.imageUrl ? (
                          <img src={platformImageSrc(group.imageUrl) ?? group.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold">{group.productName ?? "—"}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {num(group.skuTotal)} ไซส์ · {priceRangeText(group.price, group.currency)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
                          group.productStatus === "ACTIVATE"
                            ? "bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {productStatusLabel(group.productStatus)}
                      </span>
                    </div>

                    <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                      <div className="min-w-0">
                        <dt className="text-[10.5px] font-bold text-muted-foreground">คงเหลือ (ขายได้)</dt>
                        <dd
                          className={cn(
                            "mono text-[15px] font-bold tabular-nums",
                            group.totalAvailable < 0 && "text-[#b42318]",
                          )}
                        >
                          {num(group.totalAvailable)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10.5px] font-bold text-muted-foreground">จอง</dt>
                        <dd className="mono text-[15px] font-bold tabular-nums">{num(group.totalReserved)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10.5px] font-bold text-muted-foreground">รวมในมือ</dt>
                        <dd className={cn("mono text-[15px] font-bold tabular-nums", group.totalOnHand < 0 && "text-[#b42318]")}>
                          {num(group.totalOnHand)}
                        </dd>
                      </div>
                    </dl>

                    <ul className="flex min-w-0 list-none flex-col gap-2 p-0">
                      {group.skus.map((sku) => (
                        <li
                          key={sku.skuId}
                          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border p-2"
                        >
                          <Link href={detailHref(sku.skuId)} data-stock-sku={sku.skuId} scroll={false} className="min-w-0 flex-1">
                            <span className="mono block truncate text-[12.5px] font-bold underline underline-offset-2">
                              {sku.sellerSku || sku.skuId}
                            </span>
                            <span
                              className="block truncate text-[11.5px] text-muted-foreground"
                              title={variantHint(sku.variantName, sku.sellerSku) ?? undefined}
                            >
                              {variantLabel(sku.variantName, sku.sellerSku)} · {priceText(sku.price, sku.currency)}
                            </span>
                            <span className="block text-[11.5px] tabular-nums">
                              คงเหลือ (ขายได้){" "}
                              <b className={sku.available < 0 ? "text-[#b42318]" : ""}>{num(sku.available)}</b>
                              {" · "}จอง {num(sku.reserved)} · รวมในมือ {num(sku.onHand)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </TableLoadingBoundary>

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
            {historyCursor ? "ย้อนดูรายการก่อนหน้า" : `${HISTORY_PAGE_SIZE} รายการล่าสุด`} · บันทึกเมื่อยอดเปลี่ยนจากการดึงหรือจากการกดปรับในระบบ
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
        หมายเหตุ: หน้านี้แสดงประกาศบน {platformTab(platform).label} และสวิตช์เปิด/ปิดตะกร้าเท่านั้น
        · การปรับสต็อกและการสร้างสินค้าใหม่ทำที่หน้าสต็อกกลาง ซึ่งเป็นเจ้าของยอดที่ดันขึ้นประกาศทุกร้าน
        · ประวัติบันทึกทั้งการเปลี่ยนที่ตรวจพบจากการดึงยอด และรายการที่ปรับจากหน้าสต็อกกลาง
      </p>

      {historyOpen ? (
        <CloseableDialog closeHref={listHref({})}>
          <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl" style={SALE_THEME}>
            <DialogHeader className="pr-11">
              <DialogTitle className="text-[16px] leading-6">ประวัติเปลี่ยนแปลงสต็อก</DialogTitle>
            </DialogHeader>
            <p className="text-[12.5px] leading-5 text-muted-foreground">
              การเคลื่อนไหวในรอบ 30 นาทีล่าสุด — จากการซิงก์ TikTok และจากการกดปรับในระบบ
              {changeStats.changes > 0
                ? ` · รอบ 5 นาทีล่าสุด +${changeStats.added} / ${changeStats.removed}`
                : ""}
            </p>
            {recentChanges.length === 0 ? (
              <p className="rounded-lg border border-border bg-card px-3 py-6 text-center text-[13px] text-muted-foreground">
                ยังไม่มีการเคลื่อนไหวสต็อกในช่วงนี้
              </p>
            ) : (
              <ul className="flex min-w-0 list-none flex-col p-0">
                {recentChanges.map((change) => (
                  <li
                    key={`${change.skuId}-${change.changedAt}-${change.delta}`}
                    className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/70 py-2 last:border-0"
                  >
                    <span className="mono text-[12.5px] font-bold">{change.sellerSku ?? change.skuId}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                      {change.productName ?? "—"}
                    </span>
                    <span className="text-[12px] text-muted-foreground tabular-nums">
                      {change.fromQty ?? "?"} → {change.toQty}
                    </span>
                    <Badge variant={change.delta > 0 ? "success" : "danger"}>
                      {change.delta > 0 ? `+${change.delta}` : change.delta}
                    </Badge>
                    <span className="text-[11.5px] text-muted-foreground tabular-nums">
                      {thaiDateTime(change.changedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </CloseableDialog>
      ) : null}

      {/* ป๊อปอัปรายละเอียด SKU — เปิดด้วยสถานะในเบราว์เซอร์ (fetch จาก API) ไม่มีการโหลดหน้าใหม่ */}
      <SaleStockDetailDialog
        platform={platform}
        dbPlatform={dbPlatform}
        shopId={shopId}
        canWrite={isSandboxShopName(shopName) || liveStockWrite}
        initialSku={params.sku ?? null}
      />
    </div>
  );
}
