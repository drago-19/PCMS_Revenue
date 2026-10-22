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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTHB } from "@/lib/format";
import { listSkuSummariesPaged } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "สรุปยอดตามรหัสสินค้า (SKU)" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    channel?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const channel = (params.channel ?? "all").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const result = await listSkuSummariesPaged({
    q,
    channel,
    page,
    pageSize: 20,
  });

  function buildHref(overrides: { nextPage?: number; nextChannel?: string }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetChannel =
      overrides.nextChannel !== undefined ? overrides.nextChannel : channel;
    if (targetChannel && targetChannel !== "all") {
      search.set("channel", targetChannel);
    }
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const query = search.toString();
    return query ? `/products?${query}` : "/products";
  }

  const hasFilters = Boolean(q || (channel && channel !== "all"));

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Multi-Channel · SKU Summary Table"
        title="หมวดสรุปยอดขายตามรหัสสินค้า (SKU)"
        description="ตารางสรุปยอดขายและจำนวนชิ้นรายรหัสสินค้าที่คำนวณเก็บไว้ล่วงหน้า (Pre-computed Summary Table) แยกตามช่องทาง TikTok / Shopee / Facebook"
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
          hint="รวมรหัสสินค้าจากไฟล์รายการสินค้า OMS"
          tone="brand"
          icon={<IconFile size={19} />}
        />
        <StatCard
          label="จำนวนที่ขายได้รวม"
          value={`${result.totals.totalQty.toLocaleString("th-TH")} ชิ้น`}
          hint="รวมทุกช่องทางจำหน่าย"
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
        <div className="shrink-0 border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          <div className="flex flex-col gap-2 min-[980px]:flex-row min-[980px]:items-center min-[980px]:justify-between">
            <div className="inline-flex flex-wrap items-center gap-1.5">
              {[
                { key: "all", label: "ทุกช่องทาง" },
                { key: "TikTok", label: "TikTok" },
                { key: "Shopee", label: "Shopee" },
                { key: "Facebook", label: "Facebook" },
              ].map((ch) => {
                const active =
                  (ch.key === "all" && (!channel || channel === "all")) ||
                  channel === ch.key;
                return (
                  <Button
                    key={ch.key}
                    asChild
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-10 min-h-[40px]"
                  >
                    <Link href={buildHref({ nextChannel: ch.key, nextPage: 1 })}>
                      {ch.label}
                    </Link>
                  </Button>
                );
              })}
            </div>

            <form
              className="flex flex-1 flex-wrap items-center gap-2 min-[640px]:flex-nowrap min-[980px]:justify-end"
              method="get"
            >
              {channel && channel !== "all" ? (
                <input type="hidden" name="channel" value={channel} />
              ) : null}
              <div className="field h-10 min-w-[200px] flex-1 max-w-[340px] bg-white">
                <IconSearch size={16} />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="ค้นหารหัสสินค้า (SKU) หรือชื่อสินค้า..."
                  aria-label="ค้นหารหัสสินค้า"
                  className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                type="submit"
                variant="default"
                size="sm"
                className="h-10 min-h-[40px] shrink-0"
              >
                <IconSearch size={15} /> ค้นหา
              </Button>
              {hasFilters ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] shrink-0"
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
              description="อัปโหลดไฟล์รายการสินค้า OMS (ไฟล์ที่ 3) เพื่อให้ระบบสร้างตารางสรุปยอดขายตามรหัสสินค้าอัตโนมัติ"
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
                  <TableHead>รหัสสินค้า (SKU)</TableHead>
                  <TableHead>ชื่อสินค้า</TableHead>
                  <TableHead className="num">ราคาตั้งต้น/ชิ้น</TableHead>
                  <TableHead className="num">TikTok</TableHead>
                  <TableHead className="num">Shopee</TableHead>
                  <TableHead className="num">Facebook</TableHead>
                  <TableHead className="num">รวมจำนวนชิ้น</TableHead>
                  <TableHead className="num">จำนวนออเดอร์</TableHead>
                  <TableHead className="num">มูลค่ารวมตั้งต้น</TableHead>
                  <TableHead className="num">ดูบิล</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.skuCode}>
                    <TableCell data-label="รหัสสินค้า (SKU)">
                      <Badge variant="neutral" className="mono font-bold">
                        {row.skuCode}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="ชื่อสินค้า" className="font-semibold">
                      {row.productName}
                    </TableCell>
                    <TableCell data-label="ราคาตั้งต้น/ชิ้น" className="num">
                      {formatTHB(row.defaultPrice)}
                    </TableCell>
                    <TableCell data-label="TikTok" className="num">
                      {row.tiktokQty > 0 ? (
                        <Badge variant="default" size="sm">
                          {row.tiktokQty.toLocaleString("th-TH")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell data-label="Shopee" className="num">
                      {row.shopeeQty > 0 ? (
                        <Badge variant="warning" size="sm">
                          {row.shopeeQty.toLocaleString("th-TH")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell data-label="Facebook" className="num">
                      {row.facebookQty > 0 ? (
                        <Badge variant="info" size="sm">
                          {row.facebookQty.toLocaleString("th-TH")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell
                      data-label="รวมจำนวนชิ้น"
                      className="num font-extrabold text-primary"
                    >
                      {row.totalQty.toLocaleString("th-TH")} ชิ้น
                    </TableCell>
                    <TableCell data-label="จำนวนออเดอร์" className="num">
                      {row.orderCount.toLocaleString("th-TH")} บิล
                    </TableCell>
                    <TableCell
                      data-label="มูลค่ารวมตั้งต้น"
                      className="num positive strong"
                    >
                      {formatTHB(row.grossAmount)}
                    </TableCell>
                    <TableCell data-label="ดูบิล" className="num">
                      <Button asChild variant="secondary" size="xs">
                        <Link href={`/bills?q=${encodeURIComponent(row.skuCode)}`}>
                          ดูบิลสินค้านี้
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
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
                channel: channel && channel !== "all" ? channel : undefined,
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
