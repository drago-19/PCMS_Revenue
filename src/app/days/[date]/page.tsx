import Link from "next/link";
import { notFound } from "next/navigation";
import { BillPreviewTrigger } from "@/components/BillPreviewDialog";
import { CopyButton } from "@/components/CopyButton";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import {
  IconAlert,
  IconArrowLeft,
  IconCheckCircle,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  type BillCategoryKey,
  type BillSortKey,
  getDailyBatchPaged,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รอบรายวัน" };

const VALID_DAY_SORTS: BillSortKey[] = [
  "latest",
  "oldest",
  "payout_desc",
  "payout_asc",
  "income_desc",
  "income_asc",
  "fee_desc",
  "fee_asc",
];

export default async function DailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{
    page?: string;
    tab?: string;
    category?: string;
    sort?: string;
  }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const resolvedSearchParams = await searchParams;
  const rawCategory = (resolvedSearchParams.category ?? "normal").trim();
  const category: BillCategoryKey =
    rawCategory === "refund_fee" || rawCategory === "zero"
      ? rawCategory
      : "normal";
  const rawSort = (resolvedSearchParams.sort ?? "latest").trim() as BillSortKey;
  const sort: BillSortKey = VALID_DAY_SORTS.includes(rawSort)
    ? rawSort
    : "latest";
  const rawPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);

  const batch = await getDailyBatchPaged({
    date,
    page: rawPage,
    pageSize: 20,
    sort,
    category,
  });
  if (!batch) notFound();

  const activeTab: "orders" | "others" =
    resolvedSearchParams.tab === "others" && batch.others.length > 0
      ? "others"
      : "orders";

  function buildDayHref(overrides: {
    nextCategory?: BillCategoryKey;
    nextSort?: BillSortKey;
    nextPage?: number;
  }) {
    const search = new URLSearchParams();
    const targetCategory = overrides.nextCategory ?? category;
    if (targetCategory !== "normal") search.set("category", targetCategory);
    const targetSort = overrides.nextSort ?? sort;
    if (targetSort !== "latest") search.set("sort", targetSort);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/days/${date}?${qs}` : `/days/${date}`;
  }

  const { pageSize, totalOrders, orderPageCount, page, orders: pagedOrders } = batch;

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · รอบชำระรายวัน"
        title={`รอบชำระ ${formatDateLong(date)}`}
        description={`บิลคำสั่งซื้อ ${totalOrders.toLocaleString("th-TH")} ใบ · รายการทั้งหมด ${batch.summary.transactionCount.toLocaleString("th-TH")} รายการ · ยอดสุทธิรวม ${formatTHB(batch.summary.totalPayout)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/days">
                <IconArrowLeft size={16} /> กลับหมวดรอบรายวัน
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/bills?date=${date}`}>
                <IconSearch size={16} /> ค้นหาบิลในรอบนี้
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href={`/days/${date}/invoices`}>
                <IconReceipt size={16} /> พิมพ์ใบกำกับภาษีทั้งรอบ
              </Link>
            </Button>
          </>
        }
      />

      <div className="stats">
        <StatCard
          label="ยอดชำระจากบิล"
          value={formatTHB(batch.summary.orderPayout)}
          hint={`ยอดสุทธิทั้งรอบ ${formatTHB(batch.summary.totalPayout)}`}
          tone="positive"
          icon={<IconWallet size={19} />}
        />
        <StatCard
          label="รายได้รวมก่อนหัก"
          value={formatTHB(batch.summary.orderIncome)}
          hint="ยอดก่อนหักค่าธรรมเนียม"
          tone="brand"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="หักค่าธรรมเนียม"
          value={formatTHB(batch.summary.orderFees)}
          hint="รวมค่าธรรมเนียมทุกประเภท"
          tone="negative"
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label="จำนวนบิลในรอบ"
          value={`${batch.summary.orderCount.toLocaleString("th-TH")} ใบ`}
          hint={
            batch.summary.otherCount > 0
              ? `รายการอื่น ${batch.summary.otherCount.toLocaleString("th-TH")} รายการ (${formatTHB(batch.summary.otherPayout)})`
              : "แสดงหน้าละ 20 รายการ"
          }
          tone="default"
          icon={<IconReceipt size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="grid w-full grid-cols-1 items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs sm:inline-flex sm:w-auto sm:flex-wrap">
              <Button
                asChild
                variant={
                  activeTab === "orders" && category === "normal"
                    ? "default"
                    : "ghost"
                }
                size="xs"
                className={
                  activeTab === "orders" && category === "normal"
                    ? "h-8 min-h-[32px] w-full shadow-xs sm:w-auto"
                    : "h-8 min-h-[32px] w-full text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={buildDayHref({ nextCategory: "normal", nextPage: 1 })}>
                  บิลขายปกติ ({batch.categoryCounts.normal.toLocaleString("th-TH")})
                </Link>
              </Button>
              <Button
                asChild
                variant={
                  activeTab === "orders" && category === "refund_fee"
                    ? "default"
                    : "ghost"
                }
                size="xs"
                className={
                  activeTab === "orders" && category === "refund_fee"
                    ? "h-8 min-h-[32px] w-full bg-[#dc2626] text-white shadow-xs hover:bg-[#b91c1c] sm:w-auto"
                    : "h-8 min-h-[32px] w-full text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link
                  href={buildDayHref({ nextCategory: "refund_fee", nextPage: 1 })}
                >
                  คืนเงิน / ตีกลับ ({batch.categoryCounts.refundFee.toLocaleString("th-TH")})
                </Link>
              </Button>
              <Button
                asChild
                variant={
                  activeTab === "orders" && category === "zero"
                    ? "default"
                    : "ghost"
                }
                size="xs"
                className={
                  activeTab === "orders" && category === "zero"
                    ? "h-8 min-h-[32px] w-full bg-[#334155] text-white shadow-xs hover:bg-[#1e293b] sm:w-auto"
                    : "h-8 min-h-[32px] w-full text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                }
              >
                <Link href={buildDayHref({ nextCategory: "zero", nextPage: 1 })}>
                  ยกเลิก / 0 บาท ({batch.categoryCounts.zero.toLocaleString("th-TH")})
                </Link>
              </Button>
              {batch.others.length > 0 ? (
                <Button
                  asChild
                  variant={activeTab === "others" ? "default" : "ghost"}
                  size="xs"
                  className={
                    activeTab === "others"
                      ? "h-8 min-h-[32px] w-full shadow-xs sm:w-auto"
                      : "h-8 min-h-[32px] w-full text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:w-auto"
                  }
                >
                  <Link href={`/days/${date}?tab=others`}>
                    รายการอื่นที่ไม่ใช่บิล ({batch.others.length.toLocaleString("th-TH")})
                  </Link>
                </Button>
              ) : null}
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            

              <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
                <Link href={`/bills?date=${date}`}>
                  <IconSearch size={14} /> ค้นหาละเอียดในหน้าบิลทั้งหมด
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {activeTab === "orders" ? (
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-[768px]:w-[215px] min-[1280px]:w-[225px]">
                    <Link
                      href={buildDayHref({
                        nextSort: sort === "latest" ? "oldest" : "latest",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>หมายเลขคำสั่งซื้อ / ช่องทาง</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "latest"
                          ? "↓"
                          : sort === "oldest"
                            ? "↑"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead>รายการสินค้า (SKU)</TableHead>
                  <TableHead className="num min-[768px]:max-[899px]:hidden">
                    <Link
                      href={buildDayHref({
                        nextSort:
                          sort === "income_asc" ? "income_desc" : "income_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>รายได้</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "income_asc"
                          ? "↑"
                          : sort === "income_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[899px]:hidden">
                    <Link
                      href={buildDayHref({
                        nextSort: sort === "fee_asc" ? "fee_desc" : "fee_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>ค่าธรรมเนียม</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "fee_asc"
                          ? "↑"
                          : sort === "fee_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num">
                    <Link
                      href={buildDayHref({
                        nextSort:
                          sort === "payout_asc" ? "payout_desc" : "payout_asc",
                        nextPage: 1,
                      })}
                      className="inline-flex items-center justify-end gap-1 text-[#0f172a] hover:text-primary"
                    >
                      <span>ยอดชำระสุทธิ</span>
                      <span className="text-[11px] text-[#64748b]">
                        {sort === "payout_asc"
                          ? "↑"
                          : sort === "payout_desc"
                            ? "↓"
                            : "↕"}
                      </span>
                    </Link>
                  </TableHead>
                  <TableHead className="num">เอกสาร</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedOrders.map((order) => {
                  const ok =
                    Math.abs(order.checks.incomeDiff) < 0.01 &&
                    Math.abs(order.checks.feeDiff) < 0.01 &&
                    Math.abs(order.checks.payoutDiff) < 0.01;
                  return (
                    <TableRow key={order.id} className="min-[768px]:[&>td]:align-top">
                      <TableCell
                        data-label="หมายเลขคำสั่งซื้อ / ช่องทาง"
                        className="min-[768px]:w-[215px] min-[1280px]:w-[225px]"
                      >
                        <div className="flex flex-col gap-1.5 max-[767px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1 leading-none">
                            <BillPreviewTrigger
                              row={order}
                              defaultTab="bill"
                              triggerVariant="link"
                              className="font-bold text-[#0f172a] hover:text-primary"
                            />
                            <CopyButton value={order.externalId} />
                          </span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1 max-[767px]:justify-end">
                            <Badge
                              variant={order.channel === "Shopee" ? "shopee" : "default"}
                              size="sm"
                              className="shrink-0 px-1.5 py-0 text-[11px]"
                            >
                              {order.channel === "Shopee" ? "Shopee" : "TikTok"}
                            </Badge>
                            {order.income < 0 ? (
                              <Badge
                                variant="danger"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                คืนเงินหลังโอน
                              </Badge>
                            ) : order.income === 0 &&
                              (order.feeTotal < 0 || order.payout < 0) ? (
                              <Badge
                                variant="warning"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                ตีกลับเสียค่าส่ง
                              </Badge>
                            ) : order.income === 0 &&
                              order.feeTotal === 0 &&
                              order.payout === 0 ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                ยกเลิก 0 บาท
                              </Badge>
                            ) : null}
                            {order.orderCode ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="mono shrink-0 border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0 text-[11px] font-semibold text-[#1e293b]"
                              >
                                ผูก #{order.orderCode}
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm" className="shrink-0 px-1.5 py-0 text-[11px]">
                                รอผูก ออเดอร์ใน shipnity
                              </Badge>
                            )}
                            {order.customerName ? (
                              <span
                                className="min-w-0 max-w-[55px] min-[1280px]:max-w-[90px] truncate text-[11.5px] font-medium text-[#475569] max-[767px]:max-w-[140px]"
                                title={order.customerName}
                              >
                                · {order.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="รายการสินค้า (SKU)"
                      >
                        {order.omsItems && order.omsItems.length > 0 ? (
                          <div className="flex w-full flex-col gap-1 text-xs max-[767px]:items-end">
                            {order.omsItems.slice(0, 2).map((item, idx) => (
                              <div
                                key={`${item.skuCode}-${idx}`}
                                className="flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-[#e2e8f0] bg-[#f8fafc]/80 px-2 py-1"
                                title={`${item.skuCode} · ${item.productName} (×${item.quantity})`}
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="mono shrink-0 rounded border border-[#cbd5e1] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#0f172a] shadow-2xs">
                                    {item.skuCode}
                                  </span>
                                  <span className="min-w-0 max-w-[76px] min-[840px]:max-w-[115px] min-[900px]:max-w-[72px] min-[980px]:max-w-[125px] min-[1100px]:max-w-[92px] min-[1200px]:max-w-[140px] min-[1360px]:max-w-[220px] min-[1536px]:max-w-[340px] truncate font-medium text-[#1e293b]">
                                    {item.productName}
                                  </span>
                                </div>
                                <span
                                  className={
                                    item.quantity > 1
                                      ? "shrink-0 rounded border border-[#bfdbfe] bg-[#eff6ff] px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-[#1d4ed8]"
                                      : "shrink-0 rounded border border-[#cbd5e1] bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#334155]"
                                  }
                                >
                                  ×{item.quantity}
                                </span>
                              </div>
                            ))}
                            {order.omsItems.length > 2 ? (
                              <BillPreviewTrigger
                                row={order}
                                defaultTab="bill"
                                triggerVariant="link"
                                label={`+${order.omsItems.length - 2} รายการอื่นในบิลนี้`}
                                className="min-h-0 w-fit rounded-md bg-[#f1f5f9] px-2 py-0.5 font-sans text-[11px] font-semibold text-[#475569] no-underline hover:bg-[#e2e8f0] hover:text-[#0f172a] hover:no-underline"
                              />
                            ) : null}
                          </div>
                        ) : !order.productDetail || order.productDetail.trim() === "/" ? (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                            <span className="text-[11px] font-semibold text-[#b45309]">
                              ({formatDate(order.createdDate)})
                            </span>
                          </div>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(order.productDetail.trim()) ? (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span className="mono font-semibold text-[#0f172a]">
                              {order.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                          </div>
                        ) : (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span className="font-semibold text-[#0f172a]">
                              {order.productDetail}
                            </span>
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        data-label="รายได้"
                        className={`num font-semibold min-[768px]:max-[899px]:hidden ${
                          order.income < 0
                            ? "danger"
                            : order.income === 0
                              ? "text-[#64748b]"
                              : "text-[#0f172a]"
                        }`}
                      >
                        <div className="min-[768px]:pt-1">
                          {formatTHB(order.income)}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ค่าธรรมเนียม"
                        className="num danger font-semibold min-[768px]:max-[899px]:hidden"
                      >
                        <div className="flex flex-col items-end gap-0.5 min-[768px]:pt-1">
                          <span>{formatTHB(order.feeTotal)}</span>
                          {order.feeTotal === 0 &&
                          order.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
                            <span className="max-w-[115px] whitespace-normal text-right text-[10.5px] leading-tight font-normal text-muted-foreground">
                              (ยังไม่มีข้อมูลรายได้จาก TikTok)
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดชำระสุทธิ"
                        className={`num payout-col font-extrabold text-[13.5px] min-[1280px]:text-[14px] ${
                          order.payout < 0
                            ? "danger"
                            : order.payout === 0
                              ? "text-[#64748b]"
                              : "positive"
                        }`}
                      >
                        <div className="flex flex-col items-end gap-1 min-[768px]:pt-0.5">
                          <span className="leading-snug">{formatTHB(order.payout)}</span>
                          <span className="hidden text-[11px] font-normal text-muted-foreground min-[768px]:max-[899px]:inline">
                            รับ {formatTHB(order.income)} · หัก {formatTHB(order.feeTotal)}
                          </span>
                          {ok ? (
                            <Badge
                              variant="success"
                              size="sm"
                              className="h-5 gap-1 px-1.5 py-0 text-[11px] font-semibold"
                            >
                              <IconCheckCircle size={11} /> ยอดตรง
                            </Badge>
                          ) : (
                            <Badge
                              variant="warning"
                              size="sm"
                              className="h-5 gap-1 px-1.5 py-0 text-[11px] font-semibold"
                            >
                              <IconAlert size={11} /> ตรวจสอบ
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-label="เอกสาร" className="num">
                        <div className="inline-flex flex-nowrap items-center justify-end rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-0.5 shadow-2xs whitespace-nowrap">
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="bill"
                            triggerVariant="ghost"
                            label="ดูบิล"
                            className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-white px-2 text-xs font-bold text-[#0f172a] shadow-2xs hover:bg-[#f1f5f9] hover:text-primary"
                          />
                          {order.transactionType === "คำสั่งซื้อ (OMS)" ||
                          order.income > 0 ||
                          order.payout > 0 ? (
                            <>
                              <span
                                aria-hidden="true"
                                className="mx-0.5 h-4 w-px shrink-0 bg-[#cbd5e1]/80"
                              />
                              <BillPreviewTrigger
                                row={order}
                                defaultTab="invoice"
                                triggerVariant="ghost"
                                label="ใบกำกับฯ"
                                className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-transparent px-2 text-xs font-semibold text-[#334155] shadow-none hover:bg-white hover:text-[#0f172a] hover:shadow-2xs"
                              />
                              <span
                                aria-hidden="true"
                                className="mx-0.5 h-4 w-px shrink-0 bg-[#cbd5e1]/80"
                              />
                              <BillPreviewTrigger
                                row={order}
                                defaultTab="invoice_full"
                                triggerVariant="ghost"
                                label="ใบเต็ม"
                                className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-transparent px-2 text-xs font-semibold text-[#334155] shadow-none hover:bg-white hover:text-[#0f172a] hover:shadow-2xs"
                              />
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={2}
                    data-label="สรุปยอดรวมตามหมวดที่เลือก"
                    className="font-bold text-[#0f172a]"
                  >
                    รวมในหมวดนี้ ({batch.categorySummary.count.toLocaleString("th-TH")} รายการ)
                  </TableCell>
                  <TableCell
                    data-label="รวมรายได้"
                    className={`num font-bold min-[768px]:max-[899px]:hidden ${
                      batch.categorySummary.income < 0
                        ? "danger"
                        : batch.categorySummary.income === 0
                          ? "text-[#64748b]"
                          : "text-[#0f172a]"
                    }`}
                  >
                    {formatTHB(batch.categorySummary.income)}
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าธรรมเนียม"
                    className="num danger font-bold min-[768px]:max-[899px]:hidden"
                  >
                    {formatTHB(batch.categorySummary.fees)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className={`num payout-col font-extrabold text-[14px] ${
                      batch.categorySummary.payout < 0
                        ? "danger"
                        : batch.categorySummary.payout === 0
                          ? "text-[#64748b]"
                          : "positive"
                    }`}
                  >
                    {formatTHB(batch.categorySummary.payout)}
                  </TableCell>
                  <TableCell data-label="" className="max-[767px]:hidden" />
                </TableRow>
              </TableFooter>
            </Table>

            <PaginationBar
              page={page}
              pageCount={orderPageCount}
              pageSize={pageSize}
              total={totalOrders}
              unitLabel="รายการ"
              basePath={`/days/${date}`}
              extraParams={{
                category: category !== "normal" ? category : undefined,
                sort: sort !== "latest" ? sort : undefined,
              }}
            />
          </>
        ) : (
          <Table variant="stack">
            <TableHeader>
              <TableRow>
                <TableHead>เลขอ้างอิง</TableHead>
                <TableHead>ประเภทธุรกรรม</TableHead>
                <TableHead className="num">ยอดชำระ</TableHead>
                <TableHead className="num">การปรับยอด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.others.map((item) => (
                <TableRow key={item.id}>
                  <TableCell data-label="เลขอ้างอิง" className="mono">
                    {item.externalId}
                  </TableCell>
                  <TableCell data-label="ประเภทธุรกรรม">
                    <Badge variant="neutral">{item.transactionType}</Badge>
                  </TableCell>
                  <TableCell data-label="ยอดชำระ" className="num strong">
                    {formatTHB(item.payout)}
                  </TableCell>
                  <TableCell data-label="การปรับยอด" className="num">
                    {formatTHB(item.adjustment)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
