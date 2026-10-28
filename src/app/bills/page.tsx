import Link from "next/link";
import { BillPreviewTrigger } from "@/components/BillPreviewDialog";
import { CopyButton } from "@/components/CopyButton";
import { DatePickerField } from "@/components/DatePickerField";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import {
  IconAlert,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { listBills, listDailyBatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "บิลทั้งหมด" };

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

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    date?: string;
    status?: string;
    link?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const rawStatus = (params.status ?? "all").trim();
  const status: "all" | "ok" | "mismatch" =
    rawStatus === "ok" || rawStatus === "mismatch" ? rawStatus : "all";
  const rawLink = (params.link ?? "all").trim();
  const linkStatus: "all" | "linked" | "unlinked" | "oms_only" =
    rawLink === "linked" || rawLink === "unlinked" || rawLink === "oms_only"
      ? rawLink
      : "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [result, dailyBatches] = await Promise.all([
    listBills({
      q,
      date,
      status,
      linkStatus,
      page,
      pageSize: 20,
    }),
    listDailyBatches(1000),
  ]);

  const availableDates = dailyBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  function buildHref(overrides: {
    nextPage?: number;
    nextStatus?: "all" | "ok" | "mismatch";
    nextLink?: "all" | "linked" | "unlinked" | "oms_only";
    nextDate?: string;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetDate =
      overrides.nextDate !== undefined ? overrides.nextDate : date;
    if (targetDate) search.set("date", targetDate);
    const targetStatus = overrides.nextStatus ?? status;
    if (targetStatus !== "all") search.set("status", targetStatus);
    const targetLink = overrides.nextLink ?? linkStatus;
    if (targetLink !== "all") search.set("link", targetLink);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const query = search.toString();
    return query ? `/bills?${query}` : "/bills";
  }

  const hasFilters = Boolean(
    q || date || status !== "all" || linkStatus !== "all",
  );

  const { minPaidDate, maxPaidDate, distinctDates } = result.dateScope;
  const isMonthSelected = /^\d{4}-\d{2}$/.test(date);
  const isYearSelected = /^\d{4}$/.test(date);
  const dateScopeText = date
    ? isMonthSelected
      ? `เฉพาะเดือน ${formatYearMonthLabel(date)} (${distinctDates} วันชำระ)`
      : isYearSelected
        ? `เฉพาะปี ${date} (${distinctDates} วันชำระ)`
        : `เฉพาะรอบชำระวันที่ ${formatDateLong(date)} (${formatDate(date)})`
    : distinctDates === 1 && maxPaidDate
      ? `รอบชำระวันที่ ${formatDateLong(maxPaidDate)} (${formatDate(maxPaidDate)})`
      : distinctDates > 1 && minPaidDate && maxPaidDate
        ? `รวมทุกวันชำระ (${distinctDates} วัน: ${formatDateLong(minPaidDate)} – ${formatDateLong(maxPaidDate)})`
        : "ยังไม่มีข้อมูลรอบชำระ";

  const printTargetPeriod = /^\d{4}-\d{2}(-\d{2})?$/.test(date)
    ? date
    : maxPaidDate
      ? maxPaidDate.slice(0, 7)
      : "";

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
        <div className="sticky top-14 z-20 shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc]/95 px-4 py-3 backdrop-blur-md min-[640px]:px-5 min-[1100px]:top-0">
          {/* แถวที่ 1: ค้นหา + เลือกเดือน/วันจากปฏิทิน + พิมพ์ใบกำกับฯ */}
          <form
            className="flex flex-wrap items-center gap-2"
            method="get"
          >
            {status !== "all" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {linkStatus !== "all" ? (
              <input type="hidden" name="link" value={linkStatus} />
            ) : null}
            <div className="field h-10 min-w-[220px] flex-1 bg-white">
              <IconSearch size={16} className="shrink-0" />
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="ค้นหาเลขคำสั่งซื้อ, รหัส OF, หรือรหัสสินค้า (SKU)..."
                aria-label="ค้นหาบิล"
                className="h-full min-h-0 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
              />
            </div>

            <DatePickerField
              name="date"
              defaultValue={date}
              placeholder="ทุกวันชำระ (เลือกเดือน/วัน)"
              availableDates={availableDates}
              basePath="/bills"
              extraParams={{
                q: q || undefined,
                status: status !== "all" ? status : undefined,
                link: linkStatus !== "all" ? linkStatus : undefined,
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
            {printTargetPeriod ? (
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="h-10 min-h-[40px] shrink-0"
              >
                <Link href={`/days/${printTargetPeriod}/invoices`}>
                  <IconReceipt size={15} />{" "}
                  {isMonthSelected || !date
                    ? `พิมพ์ทั้งเดือน (${formatYearMonthLabel(printTargetPeriod)})`
                    : `พิมพ์ทั้งวัน (${formatDateLong(printTargetPeriod)})`}
                </Link>
              </Button>
            ) : null}
          </form>

          {/* แถวที่ 2: แท็บสถานะการผูกข้อมูล + สถานะตรวจยอด + แจ้งเตือนไฟล์ OMS ที่ขาด */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="กรองตามสถานะการผูกไฟล์"
                className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs"
              >
                {[
                  {
                    key: "all" as const,
                    label: "ทั้งหมด",
                    count: result.linkCounts.all,
                    dotColor: "",
                  },
                  {
                    key: "linked" as const,
                    label: "ข้อมูลครบ",
                    count: result.linkCounts.linked,
                    dotColor: "bg-[#059669]",
                  },
                  {
                    key: "unlinked" as const,
                    label: "รอไฟล์ ออเดอร์ใน shipnity",
                    count: result.linkCounts.unlinked,
                    dotColor: "bg-[#d97706]",
                  },
                  {
                    key: "oms_only" as const,
                    label: "มีเฉพาะ ออเดอร์ใน shipnity",
                    count: result.linkCounts.omsOnly,
                    dotColor: "bg-[#2563eb]",
                  },
                ].map((item) => {
                  const active = linkStatus === item.key;
                  return (
                    <Button
                      key={item.key}
                      asChild
                      variant={active ? "default" : "ghost"}
                      size="xs"
                      className={
                        active
                          ? "h-7 min-h-[28px] shadow-2xs"
                          : "h-7 min-h-[28px] text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                      }
                    >
                      <Link href={buildHref({ nextLink: item.key, nextPage: 1 })}>
                        {item.dotColor ? (
                          <span
                            className={`size-2 rounded-full ${active ? "bg-white" : item.dotColor
                              }`}
                          />
                        ) : null}
                        <span>{item.label}</span>
                        <span
                          className={`text-xs ${active ? "text-white/90" : "text-muted-foreground"
                            }`}
                        >
                          ({item.count.toLocaleString("th-TH")})
                        </span>
                      </Link>
                    </Button>
                  );
                })}
              </div>

              <div
                className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs"
                role="navigation"
                aria-label="กรองตามสถานะตรวจยอด"
              >
                <Button
                  asChild
                  variant={status === "all" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "all"
                      ? "h-7 min-h-[28px] shadow-2xs"
                      : "h-7 min-h-[28px] text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  }
                >
                  <Link href={buildHref({ nextStatus: "all", nextPage: 1 })}>
                    ทุกสถานะยอด
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={status === "ok" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "ok"
                      ? "h-7 min-h-[28px] shadow-2xs"
                      : "h-7 min-h-[28px] text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  }
                >
                  <Link href={buildHref({ nextStatus: "ok", nextPage: 1 })}>
                    <IconCheckCircle size={13} /> ยอดตรง
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={status === "mismatch" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "mismatch"
                      ? "h-7 min-h-[28px] shadow-2xs"
                      : "h-7 min-h-[28px] text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  }
                >
                  <Link href={buildHref({ nextStatus: "mismatch", nextPage: 1 })}>
                    <IconAlert size={13} /> ต้องตรวจสอบ
                  </Link>
                </Button>
              </div>

              {q ? (
                <Badge variant="warning" size="sm">
                  ค้นหา: &ldquo;{q}&rdquo;
                </Badge>
              ) : null}
            </div>

            {result.linkCounts.unlinked > 0 ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 text-xs text-[#92400e]">
                <IconAlert size={13} className="shrink-0 text-[#d97706]" />
                <span>
                  รอไฟล์ ออเดอร์ใน shipnity{" "}
                  <strong>
                    {result.linkCounts.unlinked.toLocaleString("th-TH")} บิล
                  </strong>
                  {result.linkCounts.missingOmsCreatedDates.length > 0
                    ? ` (วันสั่งซื้อ ${result.linkCounts.missingOmsCreatedDates
                      .slice(0, 3)
                      .map((d) => formatDate(d))
                      .join(", ")})`
                    : ""}
                </span>
              </div>
            ) : null}
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
                {result.rows.map((row) => {
                  const ok =
                    Math.abs(row.checks.incomeDiff) < 0.01 &&
                    Math.abs(row.checks.feeDiff) < 0.01 &&
                    Math.abs(row.checks.payoutDiff) < 0.01;
                  return (
                    <TableRow key={row.id}>
                      <TableCell data-label="หมายเลขคำสั่งซื้อ / ช่องทาง">
                        <div className="flex flex-col gap-1 max-[767px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1">
                            <BillPreviewTrigger
                              row={row}
                              defaultTab="bill"
                              triggerVariant="link"
                              className="font-bold text-[#0f172a] hover:text-primary"
                            />
                            <CopyButton value={row.externalId} />
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 max-[767px]:justify-end">
                            <Badge variant="default" size="sm">
                              TikTok
                            </Badge>
                            {row.orderCode ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="mono border-[#cbd5e1] bg-[#f8fafc] font-semibold text-[#1e293b]"
                              >
                                ผูก #{row.orderCode}
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                รอผูก ออเดอร์ใน shipnity
                              </Badge>
                            )}
                            {row.customerName ? (
                              <span className="text-xs font-medium text-[#475569]">
                                {row.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="รายการสินค้า (SKU)">
                        {row.omsItems && row.omsItems.length > 0 ? (
                          <div className="flex flex-col gap-1.5 text-xs max-[767px]:items-end">
                            {row.omsItems.slice(0, 2).map((item, idx) => (
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
                            {row.omsItems.length > 2 ? (
                              <span className="inline-flex w-fit items-center rounded-md bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#475569]">
                                +{row.omsItems.length - 2} รายการอื่นในบิลนี้
                              </span>
                            ) : null}
                          </div>
                        ) : !row.productDetail || row.productDetail.trim() === "/" ? (
                          <span className="inline-flex items-center rounded-md border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-xs font-medium text-[#92400e]">
                            รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity ({formatDate(row.createdDate)})
                          </span>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(row.productDetail.trim()) ? (
                          <div className="flex flex-col gap-0.5 text-xs max-[767px]:items-end">
                            <span className="mono text-foreground">
                              {row.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span className="text-xs font-normal text-[#64748b]">
                              รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs max-[767px]:items-end">
                            <span className="text-foreground">{row.productDetail}</span>
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
                        {formatTHB(row.income)}
                      </TableCell>
                      <TableCell
                        data-label="ค่าธรรมเนียม"
                        className="num danger font-semibold min-[768px]:max-[959px]:hidden"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatTHB(row.feeTotal)}</span>
                          {row.feeTotal === 0 &&
                            row.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
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
                          <span>{formatTHB(row.payout)}</span>
                          <span className="hidden text-xs font-normal text-muted-foreground min-[768px]:max-[959px]:inline">
                            รับ {formatTHB(row.income)} · หัก {formatTHB(row.feeTotal)}
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
                            row={row}
                            defaultTab="bill"
                            triggerVariant="button"
                            label="ดูบิล"
                          />
                          <BillPreviewTrigger
                            row={row}
                            defaultTab="invoice"
                            triggerVariant="outline"
                            label="ใบกำกับฯ"
                          />
                          <BillPreviewTrigger
                            row={row}
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
                    data-label="สรุปยอดรวม (ตามตัวกรอง)"
                    className="font-bold text-[#0f172a]"
                  >
                    รวมทั้งหมดตามตัวกรอง ({result.total.toLocaleString("th-TH")} บิล)
                  </TableCell>
                  <TableCell
                    data-label="รวมรายได้"
                    className="num font-bold text-[#0f172a] min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(result.summary.income)}
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าธรรมเนียม"
                    className="num danger font-bold min-[768px]:max-[959px]:hidden"
                  >
                    {formatTHB(result.summary.fees)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className="num payout-col positive font-extrabold text-[14px]"
                  >
                    {formatTHB(result.summary.payout)}
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
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="บิล"
              basePath="/bills"
              extraParams={{
                q: q || undefined,
                date: date || undefined,
                status: status !== "all" ? status : undefined,
                link: linkStatus !== "all" ? linkStatus : undefined,
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
