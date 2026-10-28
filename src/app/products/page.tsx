import Link from "next/link";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
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
import { formatTHB } from "@/lib/format";
import { type SkuSortKey, listSkuSummariesPaged } from "@/lib/queries";

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

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const rawSort = (params.sort ?? "qty_desc").trim() as SkuSortKey;
  const sort: SkuSortKey = VALID_SKU_SORTS.includes(rawSort)
    ? rawSort
    : "qty_desc";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  function buildProductsHref(overrides: {
    nextSort?: SkuSortKey;
    nextPage?: number;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetSort = overrides.nextSort ?? sort;
    if (targetSort !== "qty_desc") search.set("sort", targetSort);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  const result = await listSkuSummariesPaged({
    q,
    sort,
    page,
    pageSize: 20,
  });

  const hasFilters = Boolean(q || sort !== "qty_desc");

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop & Shopee · SKU Summary Table"
        title="หมวดสรุปยอดขายตามรหัสสินค้า (SKU)"
        description="ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าจาก TikTok Shop และ Shopee ที่คำนวณเก็บไว้ล่วงหน้า (Pre-computed Summary Table)"
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
          hint="รวมรหัสสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity"
          tone="brand"
          icon={<IconFile size={19} />}
        />
        <StatCard
          label="จำนวนที่ขายได้รวม"
          value={`${result.totals.totalQty.toLocaleString("th-TH")} ชิ้น`}
          hint="รวมคำสั่งซื้อ TikTok Shop"
          tone="positive"
          icon={<IconReceipt size={19} />}
        />
        <StatCard
          label="มูลค่าราคาตั้งต้นรวม"
          value={formatTHB(result.totals.grossAmount)}
          hint="คำนวณจาก ราคาตั้งต้น × จำนวนชิ้น"
          tone="default"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="ยอดขายออเดอร์สุทธิรวม"
          value={formatTHB(result.totals.netSalesAmount)}
          hint="หลังหักส่วนลดร้านค้า"
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
              </div>
             
            </div>

            <form
              className="flex flex-1 flex-wrap items-center gap-2 min-[640px]:flex-nowrap min-[980px]:justify-end"
              method="get"
            >
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
              <Button
                type="submit"
                variant="default"
                size="sm"
                className="h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial"
              >
                <IconSearch size={15} /> ค้นหา
              </Button>
              {hasFilters ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial"
                >
                  <Link href="/products">ล้างตัวกรอง</Link>
                </Button>
              ) : null}
            </form>
          </div>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-6">
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
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>รหัสสินค้า (SKU)</TableHead>
                  <TableHead>ชื่อสินค้า</TableHead>
                  <TableHead className="num min-[768px]:max-[959px]:hidden">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "price_asc" ? "price_desc" : "price_asc",
                        nextPage: 1,
                      })}
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
                  <TableHead className="num">
                    <Link
                      href={buildProductsHref({
                        nextSort: sort === "qty_asc" ? "qty_desc" : "qty_asc",
                        nextPage: 1,
                      })}
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
                  <TableHead className="num min-[768px]:max-[1099px]:hidden">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "orders_asc" ? "orders_desc" : "orders_asc",
                        nextPage: 1,
                      })}
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
                  <TableHead className="num">
                    <Link
                      href={buildProductsHref({
                        nextSort:
                          sort === "gross_asc" ? "gross_desc" : "gross_asc",
                        nextPage: 1,
                      })}
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
                  <TableHead className="num">ดูบิล</TableHead>
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
                          <Link href={`/bills?q=${encodeURIComponent(row.skuCode)}`}>
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
                    data-label="สรุปยอดรวมทั้งหมด"
                    className="font-bold text-[#0f172a]"
                  >
                    รวมทั้งหมด ({result.totals.skuCount.toLocaleString("th-TH")}{" "}
                    รหัสสินค้า)
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
                sort: sort !== "qty_desc" ? sort : undefined,
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
