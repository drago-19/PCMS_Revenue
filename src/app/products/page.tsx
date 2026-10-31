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
  listDailyBatches,
  listSkuSummariesPaged,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "สรุปยอดตามรหัสสินค้า (SKU)" };

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

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    date?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const rawSort = (params.sort ?? "qty_desc").trim() as SkuSortKey;
  const sort: SkuSortKey = VALID_SKU_SORTS.includes(rawSort)
    ? rawSort
    : "qty_desc";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  function buildProductsHref(overrides: {
    nextSort?: SkuSortKey;
    nextPage?: number;
    nextDate?: string;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetDate =
      overrides.nextDate !== undefined ? overrides.nextDate : date;
    if (targetDate) search.set("date", targetDate);
    const targetSort = overrides.nextSort ?? sort;
    if (targetSort !== "qty_desc") search.set("sort", targetSort);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  const [result, dailyBatches] = await Promise.all([
    listSkuSummariesPaged({
      q,
      date,
      sort,
      page,
      pageSize: 20,
    }),
    listDailyBatches(1000),
  ]);

  const availableDates = dailyBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const isMonthSelected = /^\d{4}-\d{2}$/.test(date);
  const isDaySelected = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isYearSelected = /^\d{4}$/.test(date);
  const scopeHintLabel = date
    ? isMonthSelected
      ? `เฉพาะเดือน ${formatYearMonthLabel(date)}`
      : isDaySelected
        ? `เฉพาะวันที่ ${formatDateLong(date)} (${formatDate(date)})`
        : isYearSelected
          ? `เฉพาะปี ${date}`
          : `ตามวันที่ "${date}"`
    : null;

  const hasFilters = Boolean(q || date || sort !== "qty_desc");

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop, Shopee & Facebook · SKU Summary Table"
        title="หมวดสรุปยอดขายตามรหัสสินค้า (SKU)"
        description={
          scopeHintLabel
            ? `กำลังแสดงข้อมูล: ${scopeHintLabel} · ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าจาก TikTok Shop, Shopee และ Facebook`
            : "ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าจาก TikTok Shop, Shopee และ Facebook ที่คำนวณเก็บไว้ล่วงหน้า (Pre-computed Summary Table)"
        }
        actions={
          <Button asChild variant="default">
            <Link href="/import">
              <IconUpload size={17} /> อัปโหลดไฟล์เพิ่ม
            </Link>
          </Button>
        }
      />

      <div className="stats">
        <StatCard
          label="รหัสสินค้าที่ขายได้ (SKU)"
          value={`${result.totals.skuCount.toLocaleString("th-TH")} รหัส`}
          hint={
            scopeHintLabel ??
            "รวมรหัสสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity"
          }
          tone="brand"
          icon={<IconFile size={19} />}
        />
        <StatCard
          label="จำนวนที่ขายได้รวม"
          value={`${result.totals.totalQty.toLocaleString("th-TH")} ชิ้น`}
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
          value={formatTHB(result.totals.grossAmount)}
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
          value={formatTHB(result.totals.netSalesAmount)}
          hint={
            scopeHintLabel
              ? `หลังหักส่วนลดร้านค้า (${scopeHintLabel})`
              : "หลังหักส่วนลดร้านค้า"
          }
          tone="positive"
          icon={<IconWallet size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          <div className="flex flex-col gap-2 min-[980px]:flex-row min-[980px]:items-center min-[980px]:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-[980px]:w-auto">
              <div className="inline-flex flex-wrap items-center gap-1.5">
                <Badge variant="default" size="default" className="font-bold">
                  TikTok Shop
                </Badge>
                <Badge variant="shopee" size="default" className="font-bold">
                  Shopee
                </Badge>
                <Badge variant="facebook" size="default" className="font-bold">
                  Facebook
                </Badge>
              </div>
            </div>

            <FilterForm autoSubmitDelay={400} className="flex flex-1 flex-wrap items-center gap-2 min-[980px]:justify-end">
              {sort !== "qty_desc" ? (
                <input type="hidden" name="sort" value={sort} />
              ) : null}
              <div className="field h-10 w-full bg-white min-[640px]:min-w-[200px] min-[640px]:max-w-[340px] min-[640px]:flex-1">
                <IconSearch size={16} className="shrink-0" />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="ค้นหารหัสสินค้า (SKU) หรือชื่อสินค้า..."
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
                  q: q || undefined,
                  sort: sort !== "qty_desc" ? sort : undefined,
                }}
              />
              {hasFilters ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial"
                >
                  <Link href="/products" scroll={false}>
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

        <TableLoadingBoundary
          rows={12}
          columns={6}
          label="กำลังโหลดสรุปยอดรหัสสินค้า"
        >
        {result.rows.length === 0 ? (
          <div className="flex min-h-[560px] flex-col items-center justify-center p-6">
            <EmptyState
              icon={<IconFile size={28} />}
              title="ยังไม่มีข้อมูลรหัสสินค้า (SKU)"
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
              className="bills-table-animated min-[768px]:table-fixed min-w-[740px]"
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead className="min-[768px]:w-[130px] min-[1280px]:w-[150px]">
                    รหัสสินค้า (SKU)
                  </TableHead>
                  <TableHead className="min-[768px]:min-w-[220px] min-[1280px]:min-w-[280px]">
                    ชื่อสินค้า
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[959px]:hidden min-[960px]:w-[105px] min-[1280px]:w-[120px]">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "price_asc" ? "price_desc" : "price_asc",
                        nextPage: 1,
                      })}
                      scroll={false}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>ราคาตั้งต้น/ชิ้น</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "price_asc"
                          ? "↑"
                          : sort === "price_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:w-[105px] min-[1280px]:w-[118px]">
                    <Link
                      href={buildProductsHref({
                        nextSort: sort === "qty_asc" ? "qty_desc" : "qty_asc",
                        nextPage: 1,
                      })}
                      scroll={false}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>รวมจำนวนชิ้น</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "qty_asc"
                          ? "↑"
                          : sort === "qty_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[1099px]:hidden min-[1100px]:w-[110px] min-[1280px]:w-[120px]">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "orders_asc" ? "orders_desc" : "orders_asc",
                        nextPage: 1,
                      })}
                      scroll={false}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>จำนวนออเดอร์</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "orders_asc"
                          ? "↑"
                          : sort === "orders_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:w-[120px] min-[1280px]:w-[136px]">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "gross_asc" ? "gross_desc" : "gross_asc",
                        nextPage: 1,
                      })}
                      scroll={false}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>มูลค่ารวมตั้งต้น</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "gross_asc"
                          ? "↑"
                          : sort === "gross_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:w-[96px] min-[1280px]:w-[104px]">
                    ดูบิล
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row, idx) => {
                  const rank = (result.page - 1) * result.pageSize + idx + 1;
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
                      <TableCell data-label="รหัสสินค้า (SKU)">
                        <span className="mono inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-0.5 text-xs font-bold text-[#0f172a]">
                          {row.skuCode}
                        </span>
                      </TableCell>
                      <TableCell
                        data-label="ชื่อสินค้า"
                        className="font-semibold text-[#0f172a]"
                      >
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
                            href={
                              date
                                ? `/bills?q=${encodeURIComponent(row.skuCode)}&date=${encodeURIComponent(date)}`
                                : `/bills?q=${encodeURIComponent(row.skuCode)}`
                            }
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
                      ? `รวม${scopeHintLabel} (${result.totals.skuCount.toLocaleString("th-TH")} รหัสสินค้า)`
                      : `รวมทั้งหมด (${result.totals.skuCount.toLocaleString("th-TH")} รหัสสินค้า)`}
                  </TableCell>
                  <TableCell
                    data-label=""
                    className="min-[768px]:max-[959px]:hidden max-[767px]:hidden"
                  />
                  <TableCell
                    data-label="รวมจำนวนชิ้น"
                    className="num font-extrabold text-[#1d4ed8]"
                  >
                    {result.totals.totalQty.toLocaleString("th-TH")} ชิ้น
                  </TableCell>
                  <TableCell
                    data-label=""
                    className="min-[768px]:max-[1099px]:hidden max-[767px]:hidden"
                  />
                  <TableCell
                    data-label="รวมมูลค่าตั้งต้น"
                    className="num payout-col positive font-extrabold text-[14px]"
                  >
                    {formatTHB(result.totals.grossAmount)}
                  </TableCell>
                  <TableCell data-label="" className="max-[767px]:hidden" />
                </TableRow>
              </TableFooter>
            </Table>

            <PaginationBar
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="รหัสสินค้า"
              basePath="/products"
              extraParams={{
                q: q || undefined,
                date: date || undefined,
                sort: sort !== "qty_desc" ? sort : undefined,
              }}
            />
          </div>
        )}
        </TableLoadingBoundary>
      </Card>
    </div>
  );
}
