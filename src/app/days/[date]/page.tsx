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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { getDailyBatch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "รอบรายวัน" };

export default async function DailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const batch = await getDailyBatch(date);
  if (!batch) notFound();

  const resolvedSearchParams = await searchParams;
  const activeTab: "orders" | "others" =
    resolvedSearchParams.tab === "others" && batch.others.length > 0
      ? "others"
      : "orders";

  const pageSize = 20;
  const totalOrders = batch.orders.length;
  const orderPageCount = Math.max(1, Math.ceil(totalOrders / pageSize));
  const rawPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const page = Math.min(rawPage, orderPageCount);
  const pagedOrders = batch.orders.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · รอบชำระรายวัน"
        title={`รอบชำระ ${formatDateLong(date)}`}
        description={`บิลคำสั่งซื้อ ${batch.summary.orderCount.toLocaleString("th-TH")} ใบ · รายการทั้งหมด ${batch.summary.transactionCount.toLocaleString("th-TH")} รายการ · ยอดสุทธิรวม ${formatTHB(batch.summary.totalPayout)}`}
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
        <div className="shrink-0 border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-1.5">
              <Button
                asChild
                variant={activeTab === "orders" ? "default" : "outline"}
                size="sm"
                className="h-10 min-h-[40px]"
              >
                <Link href={`/days/${date}`}>
                  บิลคำสั่งซื้อ ({batch.orders.length.toLocaleString("th-TH")})
                </Link>
              </Button>
              {batch.others.length > 0 ? (
                <Button
                  asChild
                  variant={activeTab === "others" ? "default" : "outline"}
                  size="sm"
                  className="h-10 min-h-[40px]"
                >
                  <Link href={`/days/${date}?tab=others`}>
                    รายการอื่นที่ไม่ใช่บิล ({batch.others.length.toLocaleString("th-TH")})
                  </Link>
                </Button>
              ) : null}
            </div>

            <Button asChild variant="outline" size="sm" className="h-10 min-h-[40px]">
              <Link href={`/bills?date=${date}`}>
                <IconSearch size={14} /> ค้นหาละเอียดในหน้าบิลทั้งหมด
              </Link>
            </Button>
          </div>
        </div>

        {activeTab === "orders" ? (
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead>หมายเลขคำสั่งซื้อ / ช่องทาง</TableHead>
                  <TableHead>รายการสินค้า (SKU)</TableHead>
                  <TableHead>เลขที่ใบกำกับภาษี</TableHead>
                  <TableHead>วันที่สร้าง</TableHead>
                  <TableHead className="num">รายได้</TableHead>
                  <TableHead className="num">ค่าธรรมเนียม</TableHead>
                  <TableHead className="num">ยอดชำระสุทธิ</TableHead>
                  <TableHead>สถานะ</TableHead>
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
                    <TableRow key={order.id}>
                      <TableCell data-label="หมายเลขคำสั่งซื้อ / ช่องทาง">
                        <div className="flex flex-col gap-1 max-[860px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1">
                            <BillPreviewTrigger
                              row={order}
                              defaultTab="bill"
                              triggerVariant="link"
                            />
                            <CopyButton value={order.externalId} />
                          </span>
                          <div className="flex flex-wrap items-center gap-1 max-[860px]:justify-end">
                            <Badge
                              variant={
                                order.channel === "Shopee"
                                  ? "warning"
                                  : order.channel === "Facebook"
                                    ? "info"
                                    : "default"
                              }
                              size="sm"
                            >
                              {order.channel || "TikTok"}
                            </Badge>
                            {order.orderCode ? (
                              <Badge variant="neutral" size="sm" className="mono">
                                ผูก #{order.orderCode}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                (รอผูก OMS)
                              </span>
                            )}
                            {order.customerName ? (
                              <span className="text-xs font-medium text-muted-foreground">
                                {order.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="รายการสินค้า (SKU)">
                        {order.omsItems && order.omsItems.length > 0 ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            {order.omsItems.slice(0, 2).map((item, idx) => (
                              <span
                                key={`${item.skuCode}-${idx}`}
                                className="inline-flex flex-wrap items-center gap-1 max-[860px]:justify-end"
                              >
                                <Badge variant="neutral" size="sm" className="mono">
                                  {item.skuCode}
                                </Badge>
                                <span className="font-medium text-foreground">
                                  {item.productName}
                                </span>
                                <span className="font-bold text-primary">
                                  ×{item.quantity}
                                </span>
                              </span>
                            ))}
                            {order.omsItems.length > 2 ? (
                              <span className="text-xs text-muted-foreground">
                                +{order.omsItems.length - 2} รายการอื่น
                              </span>
                            ) : null}
                          </div>
                        ) : !order.productDetail || order.productDetail.trim() === "/" ? (
                          <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                            รอไฟล์ OMS ({formatDate(order.createdDate)})
                          </span>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(order.productDetail.trim()) ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            <span className="mono text-foreground">
                              {order.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                              รอชื่อสินค้า OMS
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            <span className="text-foreground">{order.productDetail}</span>
                            <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                              รอไฟล์สินค้า OMS
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-label="เลขที่ใบกำกับภาษี" className="whitespace-nowrap">
                        {order.invoiceNo ? (
                          <span className="mono text-xs text-muted-foreground">
                            {order.invoiceNo}
                          </span>
                        ) : (
                          <span className="text-xs font-normal text-[#64748b]">
                            รอไฟล์ OMS
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-label="วันที่สร้าง" className="whitespace-nowrap">
                        {formatDate(order.createdDate)}
                      </TableCell>
                      <TableCell data-label="รายได้" className="num">
                        {formatTHB(order.income)}
                      </TableCell>
                      <TableCell data-label="ค่าธรรมเนียม" className="num danger">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(order.feeTotal)}</span>
                          {order.feeTotal === 0 &&
                          order.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
                            <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                              (รอไฟล์รายได้)
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดชำระสุทธิ"
                        className="num positive strong"
                      >
                        {formatTHB(order.payout)}
                      </TableCell>
                      <TableCell data-label="สถานะ" className="whitespace-nowrap">
                        {ok ? (
                          <Badge variant="success" size="sm">
                            <IconCheckCircle size={13} /> ยอดตรง
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            <IconAlert size={13} /> ตรวจสอบ
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell data-label="เอกสาร" className="num">
                        <span className="inline-flex flex-wrap items-center justify-end gap-1 min-[980px]:flex-nowrap whitespace-nowrap">
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="bill"
                            triggerVariant="button"
                            label="ดูบิล"
                          />
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="invoice"
                            triggerVariant="ghost"
                            label="ใบกำกับฯ"
                          />
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="invoice_full"
                            triggerVariant="ghost"
                            label="ใบเต็ม"
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <PaginationBar
              page={page}
              pageCount={orderPageCount}
              pageSize={pageSize}
              total={totalOrders}
              unitLabel="บิล"
              basePath={`/days/${date}`}
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
