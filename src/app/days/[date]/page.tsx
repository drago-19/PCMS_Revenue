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

  const filteredOrders = batch.orders;

  const pageSize = 20;
  const totalOrders = filteredOrders.length;
  const orderPageCount = Math.max(1, Math.ceil(totalOrders / pageSize));
  const rawPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const page = Math.min(rawPage, orderPageCount);
  const pagedOrders = filteredOrders.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

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
        <div className="sticky top-14 z-20 shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc]/95 px-4 py-2.5 backdrop-blur-md min-[640px]:px-5 min-[1100px]:top-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs">
              <Button
                asChild
                variant={activeTab === "orders" ? "default" : "ghost"}
                size="xs"
                className={
                  activeTab === "orders"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                }
              >
                <Link href={`/days/${date}`}>
                  บิลคำสั่งซื้อ ({totalOrders.toLocaleString("th-TH")})
                </Link>
              </Button>
              {batch.others.length > 0 ? (
                <Button
                  asChild
                  variant={activeTab === "others" ? "default" : "ghost"}
                  size="xs"
                  className={
                    activeTab === "others"
                      ? "shadow-xs"
                      : "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  }
                >
                  <Link href={`/days/${date}?tab=others`}>
                    รายการอื่นที่ไม่ใช่บิล ({batch.others.length.toLocaleString("th-TH")})
                  </Link>
                </Button>
              ) : null}
            </div>

            <Button asChild variant="outline" size="sm" className="h-9">
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
                  <TableHead className="num min-[768px]:max-[959px]:hidden">
                    รายได้
                  </TableHead>
                  <TableHead className="num min-[768px]:max-[959px]:hidden">
                    ค่าธรรมเนียม
                  </TableHead>
                  <TableHead className="num">ยอดชำระสุทธิ</TableHead>
                  <TableHead className="min-[768px]:max-[1099px]:hidden">
                    สถานะ
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
                    <TableRow key={order.id}>
                      <TableCell data-label="หมายเลขคำสั่งซื้อ / ช่องทาง">
                        <div className="flex flex-col gap-1 max-[767px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1">
                            <BillPreviewTrigger
                              row={order}
                              defaultTab="bill"
                              triggerVariant="link"
                              className="font-bold text-[#0f172a] hover:text-primary"
                            />
                            <CopyButton value={order.externalId} />
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 max-[767px]:justify-end">
                            <Badge variant="default" size="sm">
                              TikTok
                            </Badge>
                            {order.orderCode ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="mono border-[#cbd5e1] bg-[#f8fafc] font-semibold text-[#1e293b]"
                              >
                                ผูก #{order.orderCode}
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                รอผูก ออเดอร์ใน shipnity
                              </Badge>
                            )}
                            {order.customerName ? (
                              <span className="text-xs font-medium text-[#475569]">
                                {order.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="รายการสินค้า (SKU)">
                        {order.omsItems && order.omsItems.length > 0 ? (
                          <div className="flex flex-col gap-1.5 text-xs max-[767px]:items-end">
                            {order.omsItems.slice(0, 2).map((item, idx) => (
                              <div
                                key={`${item.skuCode}-${idx}`}
                                className="leading-relaxed max-[767px]:text-right"
                              >
                                <span className="mono mr-1.5 inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-xs font-bold text-[#0f172a]">
                                  {item.skuCode}
                                </span>
                                <span className="font-medium text-[#1e293b]">
                                  {item.productName}
                                </span>
                                <span
                                  className={
                                    item.quantity > 1
                                      ? "ml-1.5 inline-flex items-center rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-1.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-[#1d4ed8]"
                                      : "ml-1.5 inline-flex items-center rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-[#334155]"
                                  }
                                >
                                  ×{item.quantity}
                                </span>
                              </div>
                            ))}
                            {order.omsItems.length > 2 ? (
                              <span className="inline-flex w-fit items-center rounded-md bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#475569]">
                                +{order.omsItems.length - 2} รายการอื่นในบิลนี้
                              </span>
                            ) : null}
                          </div>
                        ) : !order.productDetail || order.productDetail.trim() === "/" ? (
                          <span className="inline-flex items-center rounded-md border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-xs font-medium text-[#92400e]">
                            รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity ({formatDate(order.createdDate)})
                          </span>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(order.productDetail.trim()) ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[767px]:items-end">
                            <span className="mono text-foreground">
                              {order.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span className="text-xs font-normal text-[#64748b]">
                              รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs max-[767px]:items-end">
                            <span className="text-foreground">{order.productDetail}</span>
                            <span className="text-xs font-normal text-[#64748b]">
                              รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        data-label="รายได้"
                        className="num font-semibold text-[#0f172a] min-[768px]:max-[959px]:hidden"
                      >
                        {formatTHB(order.income)}
                      </TableCell>
                      <TableCell
                        data-label="ค่าธรรมเนียม"
                        className="num danger font-semibold min-[768px]:max-[959px]:hidden"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(order.feeTotal)}</span>
                          {order.feeTotal === 0 &&
                          order.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              (ยังไม่มีข้อมูลรายได้จาก TikTok)
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดชำระสุทธิ"
                        className="num payout-col positive font-extrabold text-[13.5px] min-[1280px]:text-[14px]"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(order.payout)}</span>
                          <span className="hidden text-xs font-normal text-muted-foreground min-[768px]:max-[959px]:inline">
                            รับ {formatTHB(order.income)} · หัก {formatTHB(order.feeTotal)}
                          </span>
                          <span className="hidden min-[768px]:max-[1099px]:inline-flex">
                            {ok ? (
                              <Badge variant="success" size="sm">
                                <IconCheckCircle size={12} /> ยอดตรง
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                <IconAlert size={12} /> ตรวจสอบ
                              </Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="สถานะ"
                        className="whitespace-nowrap min-[768px]:max-[1099px]:hidden"
                      >
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
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 min-[1280px]:flex-nowrap whitespace-nowrap">
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="bill"
                            triggerVariant="button"
                            label="ดูบิล"
                          />
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="invoice"
                            triggerVariant="outline"
                            label="ใบกำกับฯ"
                          />
                          <BillPreviewTrigger
                            row={order}
                            defaultTab="invoice_full"
                            triggerVariant="outline"
                            label="ใบเต็ม"
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={2}
                    data-label="สรุปยอดรวมทั้งรอบวัน"
                    className="font-bold text-[#0f172a]"
                  >
                    รวมบิลในรอบนี้ ({batch.summary.orderCount.toLocaleString("th-TH")} ใบ)
                  </TableCell>
                  <TableCell
                    data-label="รวมรายได้"
                    className="num font-bold text-[#0f172a] min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(batch.summary.orderIncome)}
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าธรรมเนียม"
                    className="num danger font-bold min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(batch.summary.orderFees)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className="num payout-col positive font-extrabold text-[14px]"
                  >
                    {formatTHB(batch.summary.orderPayout)}
                  </TableCell>
                  <TableCell
                    data-label=""
                    className="min-[768px]:max-[1099px]:hidden max-[767px]:hidden"
                  />
                  <TableCell data-label="" className="max-[767px]:hidden" />
                </TableRow>
              </TableFooter>
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
