import Link from "next/link";
import { BillPreviewTrigger } from "@/components/BillPreviewDialog";
import { CopyButton } from "@/components/CopyButton";
import { DatePickerField } from "@/components/DatePickerField";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
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
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { listBills, listDailyBatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "บิลทั้งหมด" };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    date?: string;
    channel?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const channel = (params.channel ?? "all").trim();
  const rawStatus = (params.status ?? "all").trim();
  const status: "all" | "ok" | "mismatch" =
    rawStatus === "ok" || rawStatus === "mismatch" ? rawStatus : "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [result, dailyBatches] = await Promise.all([
    listBills({ q, date, channel, status, page, pageSize: 20 }),
    listDailyBatches(60),
  ]);

  const availableDates = dailyBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  function buildHref(overrides: {
    nextPage?: number;
    nextStatus?: "all" | "ok" | "mismatch";
    nextDate?: string;
    nextChannel?: string;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetDate =
      overrides.nextDate !== undefined ? overrides.nextDate : date;
    if (targetDate) search.set("date", targetDate);
    const targetChannel =
      overrides.nextChannel !== undefined ? overrides.nextChannel : channel;
    if (targetChannel && targetChannel !== "all") {
      search.set("channel", targetChannel);
    }
    const targetStatus = overrides.nextStatus ?? status;
    if (targetStatus !== "all") search.set("status", targetStatus);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const query = search.toString();
    return query ? `/bills?${query}` : "/bills";
  }

  const hasFilters = Boolean(
    q || date || status !== "all" || (channel && channel !== "all"),
  );

  const { minPaidDate, maxPaidDate, distinctDates } = result.dateScope;
  const dateScopeText = date
    ? `เฉพาะรอบชำระวันที่ ${formatDateLong(date)} (${formatDate(date)})`
    : distinctDates === 1 && maxPaidDate
      ? `รอบชำระวันที่ ${formatDateLong(maxPaidDate)} (${formatDate(maxPaidDate)})`
      : distinctDates > 1 && minPaidDate && maxPaidDate
        ? `รวมทุกวันชำระ (${distinctDates} วัน: ${formatDateLong(minPaidDate)} – ${formatDateLong(maxPaidDate)})`
        : "ยังไม่มีข้อมูลรอบชำระ";

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · Order Settlements"
        title="หมวดบิลคำสั่งซื้อทั้งหมด"
        description={`กำลังแสดงข้อมูล: ${dateScopeText} · คลิกดูบิลหรือใบกำกับภาษีรายคำสั่งซื้อแบบป๊อปอัปได้ทันที`}
        actions={
          <Button asChild variant="default">
            <Link href="/import">
              <IconUpload size={17} /> อัปโหลดไฟล์รายได้
            </Link>
          </Button>
        }
      />

      <div className="stats">
        <StatCard
          label="ยอดชำระสุทธิ (ตามตัวกรอง)"
          value={formatTHB(result.summary.payout)}
          hint={date ? `รอบชำระ ${formatDateLong(date)}` : dateScopeText}
          tone="positive"
          icon={<IconWallet size={19} />}
        />
        <StatCard
          label="รายได้รวมก่อนหัก"
          value={formatTHB(result.summary.income)}
          hint="ยอดขายรวมก่อนหักค่าธรรมเนียม"
          tone="brand"
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="หักค่าธรรมเนียมรวม"
          value={formatTHB(result.summary.fees)}
          hint="ค่าธรรมเนียม TikTok Shop ทั้งหมด"
          tone="negative"
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label="จำนวนบิลที่แสดง"
          value={`${result.total.toLocaleString("th-TH")} บิล`}
          hint={
            date
              ? `ของวันที่ ${formatDate(date)}`
              : distinctDates > 0
                ? `จากทั้งหมด ${distinctDates} วันชำระ (หน้าละ 20 บิล)`
                : "แสดงหน้าละ 20 รายการ"
          }
          tone="default"
          icon={<IconReceipt size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <div className="shrink-0 border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
          {/* แถบแสดงวันที่ของข้อมูลปัจจุบัน + ปุ่มสลับวันด่วน */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                <IconCalendar size={15} className="text-primary" />
                วันที่ของข้อมูลที่แสดง:
              </span>
              <Badge
                variant={date ? "default" : "neutral"}
                size="default"
                className="font-bold"
              >
                {dateScopeText}
              </Badge>
              {q ? (
                <Badge variant="warning" size="sm">
                  คำค้นหา: &ldquo;{q}&rdquo;
                </Badge>
              ) : null}
              {channel && channel !== "all" ? (
                <Badge
                  variant={
                    channel === "Shopee"
                      ? "warning"
                      : channel === "Facebook"
                        ? "info"
                        : "default"
                  }
                  size="sm"
                >
                  ช่องทาง: {channel}
                </Badge>
              ) : null}
            </div>

            {availableDates.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  เลือกดูตามวัน:
                </span>
                <Link
                  href={buildHref({ nextDate: "", nextPage: 1 })}
                  className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                    !date
                      ? "border-primary bg-primary text-white shadow-xs"
                      : "border-border bg-white text-foreground hover:bg-muted"
                  }`}
                >
                  ทุกวัน ({dailyBatches.reduce((acc, b) => acc + b.orderCount, 0).toLocaleString("th-TH")})
                </Link>
                {availableDates.slice(0, 5).map((item) => {
                  const active = date === item.date;
                  return (
                    <Link
                      key={item.date}
                      href={buildHref({ nextDate: item.date, nextPage: 1 })}
                      className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-primary bg-primary text-white shadow-xs"
                          : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-[#fff0f3]"
                      }`}
                    >
                      <span>{formatDateLong(item.date)}</span>
                      <span
                        className={`text-xs ${
                          active ? "text-white/90" : "text-muted-foreground"
                        }`}
                      >
                        ({item.count.toLocaleString("th-TH")})
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* แถบแยกป้ายช่องทาง (TikTok / Shopee / Facebook) */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-2">
            <span className="text-xs font-bold text-foreground">
              ช่องทางจำหน่าย:
            </span>
            {[
              { key: "all", label: "ทุกช่องทาง" },
              { key: "TikTok", label: "TikTok" },
              { key: "Shopee", label: "Shopee" },
              { key: "Facebook", label: "Facebook" },
            ].map((ch) => {
              const count = result.channelCounts[ch.key] ?? 0;
              const active =
                (ch.key === "all" && (!channel || channel === "all")) ||
                channel === ch.key;
              return (
                <Link
                  key={ch.key}
                  href={buildHref({ nextChannel: ch.key, nextPage: 1 })}
                  className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-primary bg-primary text-white shadow-xs"
                      : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-[#fff0f3]"
                  }`}
                >
                  <span>{ch.label}</span>
                  <span
                    className={`text-xs ${
                      active ? "text-white/90" : "text-muted-foreground"
                    }`}
                  >
                    ({count.toLocaleString("th-TH")})
                  </span>
                </Link>
              );
            })}
          </div>

          {/* แถบเครื่องมือกรองสถานะ + ค้นหา + DatePicker Component (ความสูง 40px เท่ากันทุกชิ้น) */}
          <div className="flex flex-col gap-2 min-[980px]:flex-row min-[980px]:items-center min-[980px]:justify-between">
            <div
              className="inline-flex flex-wrap items-center gap-1.5"
              role="navigation"
              aria-label="กรองตามสถานะตรวจยอด"
            >
              <Button
                asChild
                variant={status === "all" ? "default" : "outline"}
                size="sm"
                className="h-10 min-h-[40px]"
              >
                <Link href={buildHref({ nextStatus: "all", nextPage: 1 })}>
                  บิลทั้งหมด
                </Link>
              </Button>
              <Button
                asChild
                variant={status === "ok" ? "default" : "outline"}
                size="sm"
                className="h-10 min-h-[40px]"
              >
                <Link href={buildHref({ nextStatus: "ok", nextPage: 1 })}>
                  <IconCheckCircle size={14} /> ยอดตรง
                </Link>
              </Button>
              <Button
                asChild
                variant={status === "mismatch" ? "default" : "outline"}
                size="sm"
                className="h-10 min-h-[40px]"
              >
                <Link href={buildHref({ nextStatus: "mismatch", nextPage: 1 })}>
                  <IconAlert size={14} /> ต้องตรวจสอบ
                </Link>
              </Button>
            </div>

            <form
              className="flex flex-1 flex-wrap items-center gap-2 min-[640px]:flex-nowrap min-[980px]:justify-end"
              method="get"
            >
              {status !== "all" ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              {channel && channel !== "all" ? (
                <input type="hidden" name="channel" value={channel} />
              ) : null}
              <div className="field h-10 min-w-[200px] flex-1 max-w-[320px] bg-white">
                <IconSearch size={16} />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="ค้นหาเลขคำสั่งซื้อ, รหัส OF, หรือ SKU..."
                  aria-label="ค้นหาบิล"
                  className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>

              <DatePickerField
                name="date"
                defaultValue={date}
                placeholder="ทุกวันชำระ (เลือกวันที่)"
                availableDates={availableDates}
                basePath="/bills"
                extraParams={{
                  q: q || undefined,
                  channel: channel && channel !== "all" ? channel : undefined,
                  status: status !== "all" ? status : undefined,
                }}
              />

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
                  <Link href="/bills">ล้างตัวกรอง</Link>
                </Button>
              ) : null}
              {date ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-[40px] shrink-0"
                >
                  <Link href={`/days/${date}/invoices`}>
                    <IconReceipt size={15} /> พิมพ์ใบกำกับฯ ทั้งรอบ
                  </Link>
                </Button>
              ) : null}
            </form>
          </div>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconReceipt size={28} />}
              title="ไม่พบบิลที่ตรงกับเงื่อนไข"
              description={
                hasFilters
                  ? "ลองเปลี่ยนวันที่ สถานะ ล้างตัวกรอง หรือค้นหาด้วยหมายเลขคำสั่งซื้อบางส่วน"
                  : "ยังไม่มีบิลในระบบ เริ่มต้นด้วยการอัปโหลดไฟล์รายได้จาก TikTok Shop"
              }
              action={
                hasFilters ? (
                  <Button asChild variant="secondary">
                    <Link href="/bills">ล้างตัวกรองทั้งหมด</Link>
                  </Button>
                ) : (
                  <Button asChild variant="default">
                    <Link href="/import">
                      <IconUpload size={17} /> อัปโหลดไฟล์แรก
                    </Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead>หมายเลขคำสั่งซื้อ / ช่องทาง</TableHead>
                  <TableHead>รายการสินค้า (SKU)</TableHead>
                  <TableHead>เลขที่ใบกำกับภาษี</TableHead>
                  <TableHead>วันที่ชำระเงิน / วันสั่งซื้อ</TableHead>
                  <TableHead className="num">รายได้</TableHead>
                  <TableHead className="num">ค่าธรรมเนียม</TableHead>
                  <TableHead className="num">ยอดชำระสุทธิ</TableHead>
                  <TableHead>สถานะตรวจยอด</TableHead>
                  <TableHead className="num">เอกสาร</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => {
                  const ok =
                    Math.abs(row.checks.incomeDiff) < 0.01 &&
                    Math.abs(row.checks.feeDiff) < 0.01 &&
                    Math.abs(row.checks.payoutDiff) < 0.01;
                  return (
                    <TableRow key={row.id}>
                      <TableCell data-label="หมายเลขคำสั่งซื้อ / ช่องทาง">
                        <div className="flex flex-col gap-1 max-[860px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1">
                            <BillPreviewTrigger
                              row={row}
                              defaultTab="bill"
                              triggerVariant="link"
                            />
                            <CopyButton value={row.externalId} />
                          </span>
                          <div className="flex flex-wrap items-center gap-1 max-[860px]:justify-end">
                            <Badge
                              variant={
                                row.channel === "Shopee"
                                  ? "warning"
                                  : row.channel === "Facebook"
                                    ? "info"
                                    : "default"
                              }
                              size="sm"
                            >
                              {row.channel || "TikTok"}
                            </Badge>
                            {row.orderCode ? (
                              <Badge variant="neutral" size="sm" className="mono">
                                ผูก #{row.orderCode}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                (รอผูก OMS)
                              </span>
                            )}
                            {row.customerName ? (
                              <span className="text-xs font-medium text-muted-foreground">
                                {row.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="รายการสินค้า (SKU)">
                        {row.omsItems && row.omsItems.length > 0 ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            {row.omsItems.slice(0, 2).map((item, idx) => (
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
                            {row.omsItems.length > 2 ? (
                              <span className="text-xs text-muted-foreground">
                                +{row.omsItems.length - 2} รายการอื่น
                              </span>
                            ) : null}
                          </div>
                        ) : !row.productDetail || row.productDetail.trim() === "/" ? (
                          <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                            รอไฟล์ OMS ({formatDate(row.createdDate)})
                          </span>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(row.productDetail.trim()) ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            <span className="mono text-foreground">
                              {row.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                              รอชื่อสินค้า OMS
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs max-[860px]:items-end">
                            <span className="text-foreground">{row.productDetail}</span>
                            <span className="text-xs font-normal text-[#64748b] whitespace-nowrap">
                              รอไฟล์สินค้า OMS
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-label="เลขที่ใบกำกับภาษี" className="whitespace-nowrap">
                        {row.invoiceNo ? (
                          <span className="mono text-xs text-muted-foreground">
                            {row.invoiceNo}
                          </span>
                        ) : (
                          <span className="text-xs font-normal text-[#64748b]">
                            รอไฟล์ OMS
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-label="วันที่ชำระเงิน / วันสั่งซื้อ">
                        <div className="flex flex-col items-start gap-1 text-xs max-[860px]:items-end">
                          <Link
                            href={buildHref({ nextDate: row.paidDate, nextPage: 1 })}
                            title={`คลิกเพื่อกรองเฉพาะวันที่ชำระ ${formatDateLong(row.paidDate)} (${formatDate(row.paidDate)})`}
                            className="inline-flex items-center gap-1 rounded-md border border-[#fecdd3] bg-[#fff0f3] px-2 py-0.5 font-bold whitespace-nowrap text-[#be123c] hover:bg-[#ffe4ea]"
                          >
                            <IconCalendar size={12} className="shrink-0" />
                            <span>ชำระ {formatDateLong(row.paidDate)}</span>
                          </Link>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            สั่งซื้อ {formatDate(row.createdDate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell data-label="รายได้" className="num font-medium">
                        {formatTHB(row.income)}
                      </TableCell>
                      <TableCell
                        data-label="ค่าธรรมเนียม"
                        className="num danger font-medium"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(row.feeTotal)}</span>
                          {row.feeTotal === 0 &&
                          row.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
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
                        {formatTHB(row.payout)}
                      </TableCell>
                      <TableCell data-label="สถานะตรวจยอด" className="whitespace-nowrap">
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
                            row={row}
                            defaultTab="bill"
                            triggerVariant="button"
                            label="ดูบิล"
                          />
                          <BillPreviewTrigger
                            row={row}
                            defaultTab="invoice"
                            triggerVariant="ghost"
                            label="ใบกำกับฯ"
                          />
                          <BillPreviewTrigger
                            row={row}
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
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="บิล"
              basePath="/bills"
              extraParams={{
                q: q || undefined,
                date: date || undefined,
                channel: channel && channel !== "all" ? channel : undefined,
                status: status !== "all" ? status : undefined,
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
