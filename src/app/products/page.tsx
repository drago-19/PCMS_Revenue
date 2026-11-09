import Link from "next/link";
import { DatePickerField } from "@/components/DatePickerField";
import { FilterForm } from "@/components/FilterForm";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import { TableLoadingBoundary } from "@/components/TableLoadingBoundary";
import {
  IconFile,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import {
  type SkuSortKey,
  type StockSortKey,
  type StockFilterKey,
  listDailyBatches,
  listSkuSummariesPaged,
  listProductStockPaged,
} from "@/lib/queries";
import { ProductsTabsBar } from "@/components/ProductsTabsBar";
import { StockTableClient, StockRowAction } from "@/components/StockTableClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "สรุปยอดตามรหัสสินค้าและระบบสต๊อก" };

const VALID_SKU_SORTS: SkuSortKey[] = [
  "qty_desc",
  "qty_asc",
  "gross_desc",
  "gross_asc",
  "orders_desc",
  "orders_asc",
  "price_desc",
  "price_asc",
];

const VALID_STOCK_SORTS: StockSortKey[] = [
  "remaining_asc",
  "remaining_desc",
  "qty_desc",
  "qty_asc",
  "stock_value_desc",
  "stock_value_asc",
  "cogs_desc",
  "cogs_asc",
  "cost_desc",
  "cost_asc",
  "sku_asc",
  "sku_desc",
];

const VALID_STOCK_FILTERS: StockFilterKey[] = [
  "all",
  "in_stock",
  "low_stock",
  "out_of_stock",
  "negative",
  "no_cost",
];

const THAI_MONTHS_SHORT = [
  "",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatYearMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const monthIdx = Number(m[2]);
  return `${THAI_MONTHS_SHORT[monthIdx] ?? m[2]} ${m[1]}`;
}

const VALID_CHANNELS = ["all", "TikTok", "Shopee", "Facebook", "Lazada", "LINE", "Other"] as const;
type ProductChannelFilter = (typeof VALID_CHANNELS)[number];

const CHANNEL_LABELS: Record<ProductChannelFilter, string> = {
  all: "ทุกช่องทาง",
  TikTok: "TikTok Shop",
  Shopee: "Shopee",
  Facebook: "Facebook",
  Lazada: "Lazada",
  LINE: "LINE OA",
  Other: "Other",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    date?: string;
    channel?: string;
    sort?: string;
    page?: string;
    stockFilter?: string;
  }>;
}) {
  const params = await searchParams;
  const rawTab = (params.tab ?? "sales").trim().toLowerCase();
  const currentTab: "sales" | "stock" = rawTab === "stock" ? "stock" : "sales";

  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const rawChannel = (params.channel ?? "all").trim();
  const channel: ProductChannelFilter = (VALID_CHANNELS as readonly string[]).includes(rawChannel)
    ? (rawChannel as ProductChannelFilter)
    : "all";

  const rawStockFilter = (params.stockFilter ?? "all").trim() as StockFilterKey;
  const stockFilter: StockFilterKey = VALID_STOCK_FILTERS.includes(rawStockFilter)
    ? rawStockFilter
    : "all";

  const page = Math.max(1, Number(params.page ?? "1") || 1);

  // Sorting
  const rawSort = (params.sort ?? (currentTab === "stock" ? "remaining_asc" : "qty_desc")).trim();
  const salesSort: SkuSortKey = VALID_SKU_SORTS.includes(rawSort as SkuSortKey)
    ? (rawSort as SkuSortKey)
    : "qty_desc";
  const stockSort: StockSortKey = VALID_STOCK_SORTS.includes(rawSort as StockSortKey)
    ? (rawSort as StockSortKey)
    : "remaining_asc";

  function buildHref(overrides: {
    nextTab?: "sales" | "stock";
    nextSort?: string;
    nextPage?: number;
    nextDate?: string;
    nextChannel?: ProductChannelFilter;
    nextStockFilter?: StockFilterKey;
  }) {
    const search = new URLSearchParams();
    const targetTab = overrides.nextTab !== undefined ? overrides.nextTab : currentTab;
    if (targetTab !== "sales") search.set("tab", targetTab);

    if (q) search.set("q", q);

    const targetDate = overrides.nextDate !== undefined ? overrides.nextDate : date;
    if (targetDate) search.set("date", targetDate);

    const targetChannel = overrides.nextChannel !== undefined ? overrides.nextChannel : channel;
    if (targetChannel && targetChannel !== "all") {
      search.set("channel", targetChannel);
    }

    if (targetTab === "stock") {
      const targetStockFilter =
        overrides.nextStockFilter !== undefined ? overrides.nextStockFilter : stockFilter;
      if (targetStockFilter && targetStockFilter !== "all") {
        search.set("stockFilter", targetStockFilter);
      }
      const targetSort = overrides.nextSort ?? stockSort;
      if (targetSort !== "remaining_asc") search.set("sort", targetSort);
    } else {
      const targetSort = overrides.nextSort ?? salesSort;
      if (targetSort !== "qty_desc") search.set("sort", targetSort);
    }

    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));

    const qs = search.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  // Load data according to active tab
  const [salesResult, stockResult, dailyBatches] = await Promise.all([
    currentTab === "sales"
      ? listSkuSummariesPaged({
          q,
          date,
          channel,
          sort: salesSort,
          page,
          pageSize: 20,
        })
      : null,
    currentTab === "stock"
      ? listProductStockPaged({
          q,
          date,
          channel,
          stockFilter,
          sort: stockSort,
          page,
          pageSize: 20,
        })
      : null,
    listDailyBatches(1000),
  ]);

  const availableDates = dailyBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const isMonthSelected = /^\d{4}-\d{2}$/.test(date);
  const isDaySelected = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isYearSelected = /^\d{4}$/.test(date);
  const dateScopeLabel = date
    ? isMonthSelected
      ? `เฉพาะเดือน ${formatYearMonthLabel(date)}`
      : isDaySelected
        ? `เฉพาะวันที่ ${formatDateLong(date)} (${formatDate(date)})`
        : isYearSelected
          ? `เฉพาะปี ${date}`
          : `ตามวันที่ "${date}"`
    : null;
  const channelScopeLabel = channel !== "all" ? `ช่องทาง ${CHANNEL_LABELS[channel]}` : null;
  const scopeHintLabel =
    dateScopeLabel && channelScopeLabel
      ? `${channelScopeLabel} · ${dateScopeLabel}`
      : channelScopeLabel ?? dateScopeLabel;

  const totalProductsCount =
    currentTab === "stock"
      ? (stockResult?.totals.skuCount ?? 0)
      : (salesResult?.totals.skuCount ?? 0);

  const hasFilters = Boolean(
    q ||
      date ||
      channel !== "all" ||
      (currentTab === "stock"
        ? stockFilter !== "all" || stockSort !== "remaining_asc"
        : salesSort !== "qty_desc"),
  );

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="ระบบสรุปยอดขายสินค้า สต๊อกสินค้า และราคาทุน"
        title="หมวดสินค้าและสต๊อก (Products & Inventory)"
        description={
          currentTab === "stock"
            ? "จัดการสต็อกคงเหลือ บันทึกของเข้า-ของออก และคำนวณมูลค่าสินค้าคงเหลือและต้นทุนขาย (COGS) อัตโนมัติ"
            : scopeHintLabel
              ? `กำลังแสดงข้อมูล: ${scopeHintLabel} · ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าจากทุกช่องทางจำหน่าย`
              : "ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าจาก TikTok Shop, Shopee, Facebook, Lazada และ LINE OA"
        }
        actions={
          <Button asChild variant="default">
            <Link href="/import">
              <IconUpload size={17} /> อัปโหลดไฟล์เพิ่ม
            </Link>
          </Button>
        }
      />

      {/* Tabs Switcher: Sales vs Stock */}
      <ProductsTabsBar
        currentTab={currentTab}
        q={q}
        date={date}
        channel={channel}
        totalProductsCount={totalProductsCount}
      />

      {/* Stat Cards */}
      {currentTab === "stock" && stockResult ? (
        <div className="stats">
          <StatCard
            label="มูลค่าสต็อกคงเหลือรวม"
            value={formatTHB(stockResult.totals.totalStockValue)}
            hint="คำนวณจาก คงเหลือ (>0) × ราคาทุน"
            tone="brand"
            icon={<IconWallet size={19} />}
          />
          <StatCard
            label="จำนวนสินค้าคงเหลือรวม"
            value={`${stockResult.totals.totalRemainingUnits.toLocaleString("th-TH")} ตัว`}
            hint="(สต็อกตั้งต้น + ของเข้า) - ยอดขายสะสม"
            tone={stockResult.totals.totalRemainingUnits >= 0 ? "positive" : "negative"}
            icon={<IconReceipt size={19} />}
          />
          <StatCard
            label="ต้นทุนขายรวม (COGS)"
            value={formatTHB(stockResult.totals.totalCogs)}
            hint={
              scopeHintLabel
                ? `ของออก (${scopeHintLabel}) × ราคาทุน`
                : "ของออกทั้งหมด × ราคาทุน"
            }
            tone="default"
            icon={<IconTrend size={19} />}
          />
          <StatCard
            label="การควบคุมสต็อก"
            value={`${stockResult.totals.inStockCount.toLocaleString("th-TH")} รหัส`}
            hint={`มีของ ${stockResult.totals.inStockCount} · ใกล้หมด ${stockResult.totals.lowStockCount} · หมด ${stockResult.totals.outOfStockCount} · ติดลบ ${stockResult.totals.negativeCount}`}
            tone={stockResult.totals.negativeCount > 0 ? "negative" : "positive"}
            icon={<IconFile size={19} />}
          />
        </div>
      ) : salesResult ? (
        <div className="stats">
          <StatCard
            label="รหัสสินค้าที่ขายได้"
            value={`${salesResult.totals.skuCount.toLocaleString("th-TH")} รหัส`}
            hint={scopeHintLabel ?? "รวมรหัสสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity"}
            tone="brand"
            icon={<IconFile size={19} />}
          />
          <StatCard
            label="จำนวนที่ขายได้รวม"
            value={`${salesResult.totals.totalQty.toLocaleString("th-TH")} ชิ้น`}
            hint={
              scopeHintLabel
                ? `จำนวนชิ้นรวม (${scopeHintLabel})`
                : "รวมคำสั่งซื้อ TikTok Shop, Shopee และ Facebook"
            }
            tone="positive"
            icon={<IconReceipt size={19} />}
          />
          <StatCard
            label="มูลค่าราคาตั้งต้นรวม"
            value={formatTHB(salesResult.totals.grossAmount)}
            hint={
              scopeHintLabel
                ? `ราคาตั้งต้น × จำนวนชิ้น (${scopeHintLabel})`
                : "คำนวณจาก ราคาตั้งต้น × จำนวนชิ้น"
            }
            tone="default"
            icon={<IconTrend size={19} />}
          />
          <StatCard
            label="ยอดขายออเดอร์สุทธิรวม"
            value={formatTHB(salesResult.totals.netSalesAmount)}
            hint={
              scopeHintLabel
                ? `หลังหักส่วนลดร้านค้า (${scopeHintLabel})`
                : "หลังหักส่วนลดร้านค้า"
            }
            tone="positive"
            icon={<IconWallet size={19} />}
          />
        </div>
      ) : null}

      <Card className="workspace-table-card">
        {/* Filter bar */}
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          <div className="flex flex-col gap-2 min-[980px]:flex-row min-[980px]:items-center min-[980px]:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-[980px]:w-auto">
              <div
                className="inline-flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="กรองตามช่องทางจำหน่าย"
              >
                {(
                  [
                    { key: "all", label: "ทุกช่องทาง", variant: "neutral" },
                    { key: "TikTok", label: "TikTok Shop", variant: "default" },
                    { key: "Shopee", label: "Shopee", variant: "shopee" },
                    { key: "Facebook", label: "Facebook", variant: "facebook" },
                    { key: "Lazada", label: "Lazada", variant: "lazada" },
                    { key: "LINE", label: "LINE OA", variant: "line" },
                    { key: "Other", label: "Other", variant: "other" },
                  ] as const
                ).map((item) => {
                  const active = channel === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={buildHref({
                        nextChannel: item.key,
                        nextPage: 1,
                      })}
                      scroll={false}
                      className="inline-flex min-h-[36px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge
                        variant={item.variant}
                        size="default"
                        className={
                          active
                            ? "font-extrabold ring-2 ring-slate-900 ring-offset-1 shadow-2xs"
                            : "font-bold opacity-80 hover:opacity-100 transition-opacity"
                        }
                      >
                        {active ? `✓ ${item.label}` : item.label}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>

            <FilterForm
              autoSubmitDelay={400}
              className="flex flex-1 flex-wrap items-center gap-2 min-[980px]:justify-end"
            >
              {currentTab !== "sales" ? <input type="hidden" name="tab" value={currentTab} /> : null}
              {currentTab === "stock" && stockSort !== "remaining_asc" ? (
                <input type="hidden" name="sort" value={stockSort} />
              ) : currentTab === "sales" && salesSort !== "qty_desc" ? (
                <input type="hidden" name="sort" value={salesSort} />
              ) : null}
              {currentTab === "stock" && stockFilter !== "all" ? (
                <input type="hidden" name="stockFilter" value={stockFilter} />
              ) : null}
              {channel !== "all" ? <input type="hidden" name="channel" value={channel} /> : null}

              <div className="field h-10 w-full bg-white min-[640px]:min-w-[200px] min-[640px]:max-w-[340px] min-[640px]:flex-1">
                <IconSearch size={16} className="shrink-0" />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า..."
                  aria-label="ค้นหารหัสสินค้า"
                  className="h-full min-h-0 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
                />
              </div>

              <DatePickerField
                name="date"
                defaultValue={date}
                placeholder="ทุกวันชำระ (เลือกเดือน/วัน)"
                availableDates={availableDates}
                basePath="/products"
                className="w-full sm:w-auto"
                extraParams={{
                  tab: currentTab !== "sales" ? currentTab : undefined,
                  q: q || undefined,
                  channel: channel !== "all" ? channel : undefined,
                  stockFilter: stockFilter !== "all" ? stockFilter : undefined,
                  sort:
                    currentTab === "stock"
                      ? stockSort !== "remaining_asc"
                        ? stockSort
                        : undefined
                      : salesSort !== "qty_desc"
                        ? salesSort
                        : undefined,
                }}
              />

              {hasFilters ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial"
                >
                  <Link
                    href={currentTab === "stock" ? "/products?tab=stock" : "/products"}
                    scroll={false}
                  >
                    ล้างตัวกรอง
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-label="ล้างตัวกรอง (ยังไม่ได้เลือกตัวกรอง)"
                  className="h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial"
                >
                  ล้างตัวกรอง
                </Button>
              )}
            </FilterForm>
          </div>
        </div>

        {/* Tab-specific sub-action bar for Stock View */}
        {currentTab === "stock" && stockResult ? (
          <>
            <StockTableClient
              rows={stockResult.rows}
              page={stockResult.page}
              pageSize={stockResult.pageSize}
            />

            {/* Quick stock status filter pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-white px-4 py-2 min-[640px]:px-5">
              <span className="text-xs font-bold text-[#64748b] mr-1">สถานะสต็อก:</span>
              {[
                {
                  key: "all",
                  label: "ทั้งหมด",
                  count: stockResult.totals.allCount ?? stockResult.totals.skuCount,
                  tone: "neutral",
                },
                {
                  key: "in_stock",
                  label: "มีสต็อก (>10)",
                  count: stockResult.totals.inStockCount,
                  tone: "positive",
                },
                {
                  key: "low_stock",
                  label: "ใกล้หมด (1–10)",
                  count: stockResult.totals.lowStockCount,
                  tone: "warning",
                },
                {
                  key: "out_of_stock",
                  label: "สต็อกหมด (0)",
                  count: stockResult.totals.outOfStockCount,
                  tone: "danger",
                },
                {
                  key: "negative",
                  label: "สต็อกติดลบ (<0)",
                  count: stockResult.totals.negativeCount,
                  tone: "danger",
                },
                {
                  key: "no_cost",
                  label: "ยังไม่ใส่ราคาทุน",
                  count: stockResult.totals.noCostCount,
                  tone: "warning",
                },
              ].map((pill) => {
                const active = stockFilter === pill.key;
                return (
                  <Link
                    key={pill.key}
                    href={buildHref({ nextStockFilter: pill.key as StockFilterKey, nextPage: 1 })}
                    scroll={false}
                    className="inline-flex min-h-[30px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Badge
                      variant={
                        pill.tone === "positive"
                          ? "success"
                          : pill.tone === "warning"
                            ? "warning"
                            : pill.tone === "danger"
                              ? "danger"
                              : "neutral"
                      }
                      size="sm"
                      className={
                        active
                          ? "font-extrabold ring-2 ring-slate-900 ring-offset-1 shadow-2xs"
                          : "font-semibold opacity-75 hover:opacity-100"
                      }
                    >
                      {pill.label} ({pill.count.toLocaleString("th-TH")})
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </>
        ) : null}

        {/* Tables Region */}
        {currentTab === "stock" && stockResult ? (
          <TableLoadingBoundary rows={12} columns={10} label="กำลังโหลดข้อมูลสต็อกและต้นทุน">
            {stockResult.rows.length === 0 ? (
              <div className="flex min-h-[460px] flex-col items-center justify-center p-6">
                <EmptyState
                  icon={<IconFile size={28} />}
                  title="ไม่พบรายการสินค้าที่ตรงกับเงื่อนไข"
                  description="ลองเปลี่ยนคำค้นหา หรือกดปุ่ม 'ล้างตัวกรอง' เพื่อดูสินค้าทั้งหมด"
                  action={
                    <Button asChild variant="outline">
                      <Link href="/products?tab=stock" scroll={false}>
                        ล้างตัวกรอง
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="bills-content-region">
                <Table
                  variant="stack"
                  containerClassName="overflow-x-auto"
                  className="bills-table-animated min-[768px]:table-fixed min-[768px]:min-w-[730px] min-[1280px]:min-w-[980px]"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-11 min-[768px]:w-[4%] min-[768px]:min-w-[40px] text-center">#</TableHead>
                      <TableHead className="min-[768px]:w-[13%] min-[768px]:min-w-[125px] min-[1280px]:min-w-[135px]">
                        <Link
                          href={buildHref({
                            nextSort: stockSort === "sku_asc" ? "sku_desc" : "sku_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>รหัสสินค้า (SKU)</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "sku_asc" ? "↑" : stockSort === "sku_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="min-[768px]:w-[22%] min-[768px]:min-w-[170px] min-[1280px]:max-w-[280px]">
                        ชื่อสินค้า
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[9%] min-[768px]:min-w-[95px] min-[1280px]:min-w-[105px]">
                        <Link
                          href={buildHref({
                            nextSort: stockSort === "cost_asc" ? "cost_desc" : "cost_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>ราคาทุน/ชิ้น</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "cost_asc" ? "↑" : stockSort === "cost_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[959px]:hidden min-[960px]:w-[7%] min-[960px]:min-w-[75px] min-[1280px]:min-w-[85px]">
                        สต็อกตั้งต้น
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[959px]:hidden min-[960px]:w-[7%] min-[960px]:min-w-[75px] min-[1280px]:min-w-[85px]">
                        ของเข้า
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[8%] min-[768px]:min-w-[85px] min-[1280px]:min-w-[95px]">
                        <Link
                          href={buildHref({
                            nextSort: stockSort === "qty_asc" ? "qty_desc" : "qty_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>ของออก (ขาย)</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "qty_asc" ? "↑" : stockSort === "qty_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[11%] min-[768px]:min-w-[110px] min-[1280px]:min-w-[125px]">
                        <Link
                          href={buildHref({
                            nextSort:
                              stockSort === "remaining_asc" ? "remaining_desc" : "remaining_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>คงเหลือ</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "remaining_asc"
                              ? "↑"
                              : stockSort === "remaining_desc"
                                ? "↓"
                                : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[11%] min-[768px]:min-w-[115px] min-[1280px]:min-w-[130px]">
                        <Link
                          href={buildHref({
                            nextSort:
                              stockSort === "stock_value_asc"
                                ? "stock_value_desc"
                                : "stock_value_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>มูลค่าคงเหลือ</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "stock_value_asc"
                              ? "↑"
                              : stockSort === "stock_value_desc"
                                ? "↓"
                                : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[1099px]:hidden min-[1100px]:w-[10%] min-[1100px]:min-w-[105px] min-[1280px]:min-w-[120px]">
                        <Link
                          href={buildHref({
                            nextSort: stockSort === "cogs_asc" ? "cogs_desc" : "cogs_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>ต้นทุนขาย (COGS)</span>
                          <span className="text-[11px] text-[#64748b]">
                            {stockSort === "cogs_asc" ? "↑" : stockSort === "cogs_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="min-[768px]:w-[95px] min-[1280px]:w-[105px] text-center pr-3 min-[1280px]:pr-5">
                        จัดการ
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockResult.rows.map((row, idx) => {
                      const rank = (stockResult.page - 1) * stockResult.pageSize + idx + 1;
                      return (
                        <TableRow key={row.skuCode}>
                          <TableCell
                            data-label="ลำดับ"
                            className="text-center font-bold text-[#64748b]"
                          >
                            <span className="mono text-xs">{rank}</span>
                          </TableCell>
                          <TableCell data-label="รหัสสินค้า">
                            <span className="mono inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-0.5 text-xs font-bold text-[#0f172a]">
                              {row.skuCode}
                            </span>
                          </TableCell>
                          <TableCell data-label="ชื่อสินค้า" className="font-semibold text-[#0f172a] min-[768px]:max-w-[280px]">
                            <div className="line-clamp-2" title={row.productName}>
                              {row.productName}
                            </div>
                          </TableCell>
                          <TableCell data-label="ราคาทุน/ชิ้น" className="num font-bold">
                            {row.costPrice > 0 ? (
                              <span className="mono text-amber-900">{formatTHB(row.costPrice)}</span>
                            ) : (
                              <Badge variant="outline" size="sm" className="text-[10px] text-slate-400">
                                ฿0.00
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            data-label="สต็อกตั้งต้น"
                            className="num font-mono text-slate-700 min-[768px]:max-[959px]:hidden"
                          >
                            {row.initialStock.toLocaleString("th-TH")}
                          </TableCell>
                          <TableCell
                            data-label="ของเข้า"
                            className="num font-mono text-emerald-700 min-[768px]:max-[959px]:hidden"
                          >
                            {row.stockIn > 0 ? `+${row.stockIn.toLocaleString("th-TH")}` : "0"}
                          </TableCell>
                          <TableCell
                            data-label="ของออก (ขาย)"
                            className="num font-mono font-bold text-blue-700"
                          >
                            {row.soldQty.toLocaleString("th-TH")}
                          </TableCell>
                          <TableCell data-label="คงเหลือ" className="num">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span
                                className={`mono text-xs font-extrabold ${
                                  row.remainingStock > 10
                                    ? "text-emerald-700"
                                    : row.remainingStock > 0
                                      ? "text-amber-700"
                                      : "text-rose-700"
                                }`}
                              >
                                {row.remainingStock.toLocaleString("th-TH")}
                              </span>
                              <Badge
                                variant={
                                  row.remainingStock > 10
                                    ? "success"
                                    : row.remainingStock > 0
                                      ? "warning"
                                      : "danger"
                                }
                                size="sm"
                                className="px-1 py-0 text-[10px]"
                              >
                                {row.remainingStock > 10
                                  ? "มีของ"
                                  : row.remainingStock > 0
                                    ? "ใกล้หมด"
                                    : row.remainingStock === 0
                                      ? "หมด"
                                      : "ติดลบ"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell
                            data-label="มูลค่าคงเหลือ"
                            className="num font-mono font-extrabold text-[#0f172a]"
                          >
                            {row.costPrice > 0 ? (
                              formatTHB(row.stockValue)
                            ) : (
                              <span className="text-slate-400 font-normal text-xs" title="ยังไม่ได้ระบุราคาทุน">฿0.00</span>
                            )}
                          </TableCell>
                          <TableCell
                            data-label="ต้นทุนขาย (COGS)"
                            className="num font-mono font-bold text-slate-600 min-[768px]:max-[1099px]:hidden"
                          >
                            {row.costPrice > 0 ? (
                              formatTHB(row.cogs)
                            ) : (
                              <span className="text-slate-400 font-normal text-xs" title="ยังไม่ได้ระบุราคาทุน">฿0.00</span>
                            )}
                          </TableCell>
                          <TableCell data-label="จัดการ" className="text-center pr-3 min-[1280px]:pr-5">
                            <div className="inline-flex items-center justify-center">
                              <StockRowAction product={row} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        data-label="สรุปยอดรวม"
                        className="font-bold text-[#0f172a]"
                      >
                        รวมทั้งหมด ({stockResult.totals.skuCount.toLocaleString("th-TH")} รหัสสินค้า)
                      </TableCell>
                      <TableCell data-label="เฉลี่ยทุน" className="num font-bold text-amber-900">
                        -
                      </TableCell>
                      <TableCell className="num text-slate-500 text-xs min-[768px]:max-[959px]:hidden">
                        -
                      </TableCell>
                      <TableCell className="num text-slate-500 text-xs min-[768px]:max-[959px]:hidden">
                        -
                      </TableCell>
                      <TableCell data-label="ของออกรวม" className="num font-bold text-blue-700">
                        {stockResult.totals.totalSoldQty.toLocaleString("th-TH")}
                      </TableCell>
                      <TableCell
                        data-label="คงเหลือรวม"
                        className={`num font-bold ${
                          stockResult.totals.totalRemainingUnits >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {stockResult.totals.totalRemainingUnits.toLocaleString("th-TH")}
                      </TableCell>
                      <TableCell
                        data-label="มูลค่าสต็อกรวม"
                        className="num font-extrabold text-[#0f172a]"
                      >
                        {formatTHB(stockResult.totals.totalStockValue)}
                      </TableCell>
                      <TableCell
                        data-label="ต้นทุนขายรวม"
                        className="num font-extrabold text-[#0f172a] min-[768px]:max-[1099px]:hidden"
                      >
                        {formatTHB(stockResult.totals.totalCogs)}
                      </TableCell>
                      <TableCell className="text-center pr-3 min-[1280px]:pr-5">-</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}

            {stockResult.pageCount > 1 ? (
              <PaginationBar
                page={stockResult.page}
                pageCount={stockResult.pageCount}
                total={stockResult.total}
                pageSize={stockResult.pageSize}
                basePath="/products"
                extraParams={{
                  tab: "stock",
                  q: q || undefined,
                  date: date || undefined,
                  channel: channel !== "all" ? channel : undefined,
                  stockFilter: stockFilter !== "all" ? stockFilter : undefined,
                  sort: stockSort !== "remaining_asc" ? stockSort : undefined,
                }}
              />
            ) : null}
          </TableLoadingBoundary>
        ) : salesResult ? (
          /* Sales View (Default) */
          <TableLoadingBoundary rows={12} columns={6} label="กำลังโหลดสรุปยอดรหัสสินค้า">
            {salesResult.rows.length === 0 ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center p-6">
                <EmptyState
                  icon={<IconFile size={28} />}
                  title="ยังไม่มีข้อมูลรหัสสินค้า"
                  description="อัปโหลดไฟล์ สินค้าในออเดอร์ shipnity (ไฟล์ที่ 3) เพื่อให้ระบบสร้างตารางสรุปยอดขายตามรหัสสินค้าอัตโนมัติ"
                  action={
                    <Button asChild variant="default">
                      <Link href="/import">
                        <IconUpload size={17} /> ไปหน้าอัปโหลดไฟล์
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="bills-content-region">
                <Table
                  variant="stack"
                  className="bills-table-animated min-[768px]:table-fixed min-[768px]:min-w-[740px]"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead className="min-[768px]:w-[130px] min-[1280px]:w-[150px]">
                        รหัสสินค้า
                      </TableHead>
                      <TableHead className="min-[768px]:min-w-[220px] min-[1280px]:min-w-[280px]">
                        ชื่อสินค้า
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[959px]:hidden min-[960px]:w-[105px] min-[1280px]:w-[120px]">
                        <Link
                          href={buildHref({
                            nextSort: salesSort === "price_asc" ? "price_desc" : "price_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>ราคาตั้งต้น/ชิ้น</span>
                          <span className="text-[11px] text-[#64748b]">
                            {salesSort === "price_asc" ? "↑" : salesSort === "price_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[105px] min-[1280px]:w-[118px]">
                        <Link
                          href={buildHref({
                            nextSort: salesSort === "qty_asc" ? "qty_desc" : "qty_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>รวมจำนวนชิ้น</span>
                          <span className="text-[11px] text-[#64748b]">
                            {salesSort === "qty_asc" ? "↑" : salesSort === "qty_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:max-[1099px]:hidden min-[1100px]:w-[110px] min-[1280px]:w-[120px]">
                        <Link
                          href={buildHref({
                            nextSort: salesSort === "orders_asc" ? "orders_desc" : "orders_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>จำนวนออเดอร์</span>
                          <span className="text-[11px] text-[#64748b]">
                            {salesSort === "orders_asc" ? "↑" : salesSort === "orders_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[120px] min-[1280px]:w-[136px]">
                        <Link
                          href={buildHref({
                            nextSort: salesSort === "gross_asc" ? "gross_desc" : "gross_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
                          className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                        >
                          <span>มูลค่ารวมตั้งต้น</span>
                          <span className="text-[11px] text-[#64748b]">
                            {salesSort === "gross_asc" ? "↑" : salesSort === "gross_desc" ? "↓" : "↕"}
                          </span>
                        </Link>
                      </TableHead>
                      <TableHead className="num min-[768px]:w-[96px] min-[1280px]:w-[104px]">
                        ดูบิล
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesResult.rows.map((row, idx) => {
                      const rank = (salesResult.page - 1) * salesResult.pageSize + idx + 1;
                      return (
                        <TableRow key={row.skuCode}>
                          <TableCell
                            data-label="ลำดับ"
                            className="text-center font-bold text-[#64748b]"
                          >
                            <span
                              className={
                                rank <= 3
                                  ? "inline-flex size-6 items-center justify-center rounded-full bg-[#fff0f3] text-xs font-extrabold text-primary"
                                  : "mono text-xs text-[#64748b]"
                              }
                            >
                              {rank}
                            </span>
                          </TableCell>
                          <TableCell data-label="รหัสสินค้า">
                            <span className="mono inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-0.5 text-xs font-bold text-[#0f172a]">
                              {row.skuCode}
                            </span>
                          </TableCell>
                          <TableCell data-label="ชื่อสินค้า" className="font-semibold text-[#0f172a]">
                            {row.productName}
                          </TableCell>
                          <TableCell
                            data-label="ราคาตั้งต้น/ชิ้น"
                            className="num font-medium text-[#334155] min-[768px]:max-[959px]:hidden"
                          >
                            {formatTHB(row.defaultPrice)}
                          </TableCell>
                          <TableCell data-label="รวมจำนวนชิ้น" className="num">
                            <span className="inline-flex items-center rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 text-xs font-extrabold text-[#1d4ed8]">
                              {row.totalQty.toLocaleString("th-TH")} ชิ้น
                            </span>
                          </TableCell>
                          <TableCell
                            data-label="จำนวนออเดอร์"
                            className="num font-medium text-[#334155] min-[768px]:max-[1099px]:hidden"
                          >
                            {row.orderCount.toLocaleString("th-TH")} บิล
                          </TableCell>
                          <TableCell
                            data-label="มูลค่ารวมตั้งต้น"
                            className="num payout-col positive font-extrabold text-[13.5px] min-[1280px]:text-[14px]"
                          >
                            {formatTHB(row.grossAmount)}
                          </TableCell>
                          <TableCell data-label="ดูบิล" className="num">
                            <Button asChild variant="outline" size="xs">
                              <Link
                                href={(() => {
                                  const billQs = new URLSearchParams();
                                  billQs.set("q", row.skuCode);
                                  if (date) billQs.set("date", date);
                                  if (channel !== "all") billQs.set("channel", channel);
                                  return `/bills?${billQs.toString()}`;
                                })()}
                              >
                                ดูบิลสินค้านี้
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        data-label="สรุปยอดรวม"
                        className="font-bold text-[#0f172a]"
                      >
                        {scopeHintLabel
                          ? `รวม${scopeHintLabel} (${salesResult.totals.skuCount.toLocaleString("th-TH")} รหัสสินค้า)`
                          : `รวมทั้งหมด (${salesResult.totals.skuCount.toLocaleString("th-TH")} รหัสสินค้า)`}
                      </TableCell>
                      <TableCell
                        data-label="เฉลี่ยราคา"
                        className="num font-medium text-[#475569] min-[768px]:max-[959px]:hidden"
                      >
                        -
                      </TableCell>
                      <TableCell
                        data-label="จำนวนรวม"
                        className="num font-extrabold text-[#1d4ed8]"
                      >
                        {salesResult.totals.totalQty.toLocaleString("th-TH")} ชิ้น
                      </TableCell>
                      <TableCell
                        data-label="ออเดอร์รวม"
                        className="num font-medium text-[#475569] min-[768px]:max-[1099px]:hidden"
                      >
                        -
                      </TableCell>
                      <TableCell
                        data-label="มูลค่าตั้งต้นรวม"
                        className="num payout-col positive font-extrabold text-[13.5px] min-[1280px]:text-[14px]"
                      >
                        {formatTHB(salesResult.totals.grossAmount)}
                      </TableCell>
                      <TableCell className="num">-</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}

            {salesResult.pageCount > 1 ? (
              <PaginationBar
                page={salesResult.page}
                pageCount={salesResult.pageCount}
                total={salesResult.total}
                pageSize={salesResult.pageSize}
                basePath="/products"
                extraParams={{
                  q: q || undefined,
                  date: date || undefined,
                  channel: channel !== "all" ? channel : undefined,
                  sort: salesSort !== "qty_desc" ? salesSort : undefined,
                }}
              />
            ) : null}
          </TableLoadingBoundary>
        ) : null}
      </Card>
    </div>
  );
}
