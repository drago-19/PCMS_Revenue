import Link from "next/link";
import {
  BillPreviewProvider,
  BillPreviewTrigger,
  BillTableRow,
} from "@/components/BillPreviewDialog";
import {
  BillsCategoryTabs,
  BillsChannelBar,
  BillsFilterProvider,
  BillsSubFilters,
} from "@/components/BillsFilterInteractive";
import { CompactValueToggle } from "@/components/CompactValueToggle";
import { CopyButton } from "@/components/CopyButton";
import { DatePickerField } from "@/components/DatePickerField";
import { FilterForm } from "@/components/FilterForm";
import { EmptyState, PageHeader, StatCard } from "@/components/PageHeader";
import { PaginationBar } from "@/components/PaginationBar";
import { TableLoadingBoundary } from "@/components/TableLoadingBoundary";
import {
  IconAlert,
  IconCheckCircle,
  IconReceipt,
  IconSearch,
  IconTrend,
  IconTruck,
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
import { getRowShippingSummary } from "@/lib/bill";
import { formatDate, formatDateLong, formatTHB } from "@/lib/format";
import { isOrderEligibleForInvoice } from "@/lib/invoice";
import { cn } from "@/lib/utils";
import {
  type BillCategoryKey,
  type BillLinkStatusKey,
  type BillSortKey,
  listBills,
  listDailyBatches,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "บิลทั้งหมด" };

const VALID_BILL_SORTS: BillSortKey[] = [
  "latest",
  "oldest",
  "payout_desc",
  "payout_asc",
  "income_desc",
  "income_asc",
  "fee_desc",
  "fee_asc",
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

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    date?: string;
    createdDate?: string;
    channel?: string;
    status?: string;
    link?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const date = (params.date ?? "").trim();
  const createdDate = (params.createdDate ?? "").trim();
  const rawChannel = (params.channel ?? "all").trim();
  const channel: "all" | "TikTok" | "Shopee" | "Facebook" =
    rawChannel === "TikTok" ||
    rawChannel === "Shopee" ||
    rawChannel === "Facebook"
      ? rawChannel
      : "all";
  const rawStatus = (params.status ?? "all").trim();
  const status: "all" | "ok" | "mismatch" =
    channel === "Shopee" || channel === "Facebook"
      ? "all"
      : rawStatus === "ok" || rawStatus === "mismatch"
        ? rawStatus
        : "all";
  const rawLink = (params.link ?? "all").trim();
  const linkStatus: BillLinkStatusKey =
    rawLink === "linked" ||
    rawLink === "unlinked" ||
    rawLink === "oms_only" ||
    rawLink === "no_price" ||
    rawLink === "all_fb" ||
    rawLink === "shopee_negative" ||
    rawLink === "shopee_zero"
      ? rawLink
      : "all";
  const rawCategory = (params.category ?? "normal").trim();
  const category: BillCategoryKey =
    rawCategory === "refund_fee" || rawCategory === "zero"
      ? rawCategory
      : "normal";
  const rawSort = (params.sort ?? "latest").trim() as BillSortKey;
  const sort: BillSortKey = VALID_BILL_SORTS.includes(rawSort)
    ? rawSort
    : "latest";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [result, dailyBatches] = await Promise.all([
    listBills({
      q,
      date,
      createdDate,
      channel,
      status,
      linkStatus,
      category,
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

  function buildHref(overrides: {
    nextPage?: number;
    nextChannel?: "all" | "TikTok" | "Shopee" | "Facebook";
    nextStatus?: "all" | "ok" | "mismatch";
    nextLink?: BillLinkStatusKey;
    nextCategory?: BillCategoryKey;
    nextSort?: BillSortKey;
    nextDate?: string;
    nextCreatedDate?: string;
  }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const targetDate =
      overrides.nextDate !== undefined ? overrides.nextDate : date;
    if (targetDate) search.set("date", targetDate);
    const targetCreatedDate =
      overrides.nextCreatedDate !== undefined
        ? overrides.nextCreatedDate
        : createdDate;
    if (targetCreatedDate) search.set("createdDate", targetCreatedDate);
    const targetChannel = overrides.nextChannel ?? channel;
    if (targetChannel !== "all") search.set("channel", targetChannel);
    const targetStatus = overrides.nextStatus ?? status;
    if (targetStatus !== "all") search.set("status", targetStatus);
    const targetLink = overrides.nextLink ?? linkStatus;
    if (targetLink !== "all") search.set("link", targetLink);
    const targetCategory = overrides.nextCategory ?? category;
    if (targetCategory !== "normal") search.set("category", targetCategory);
    const targetSort = overrides.nextSort ?? sort;
    if (targetSort !== "latest") search.set("sort", targetSort);
    const targetPage = overrides.nextPage ?? 1;
    if (targetPage > 1) search.set("page", String(targetPage));
    const query = search.toString();
    return query ? `/bills?${query}` : "/bills";
  }

  const hasFilters = Boolean(
    q ||
      date ||
      createdDate ||
      channel !== "all" ||
      status !== "all" ||
      linkStatus !== "all" ||
      category !== "normal" ||
      sort !== "latest",
  );

  const { minPaidDate, maxPaidDate, distinctDates } = result.dateScope;
  const isMonthSelected = /^\d{4}-\d{2}$/.test(date);
  const isYearSelected = /^\d{4}$/.test(date);
  const dateScopeText = createdDate
    ? `เฉพาะวันสั่งซื้อวันที่ ${formatDateLong(createdDate)} (${formatDate(createdDate)})`
    : date
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
        eyebrow="TikTok Shop, Shopee & Facebook · Order Settlements"
        title="หมวดบิลคำสั่งซื้อทั้งหมด"
        description={`กำลังแสดงข้อมูล: ${dateScopeText} · คลิกดูบิลหรือใบกำกับภาษีรายคำสั่งซื้อแบบป๊อปอัปได้ทันที`}
        actions={
          <Button asChild variant="default">
            <Link href="/import" prefetch>
              <IconUpload size={17} /> อัปโหลดไฟล์รายได้
            </Link>
          </Button>
        }
      />

      <div className="stats [&>.stat]:p-[14px]">
        <StatCard
          label={
            category === "refund_fee"
              ? "ยอดหักเงินคืนค่าสินค้า"
              : "รายได้รวมก่อนหัก"
          }
          value={formatTHB(result.summary.income)}
          hint={
            category === "refund_fee"
              ? "ยอดเงินคืนค่าสินค้าหลังโอน"
              : category === "zero"
                ? "ออเดอร์ยกเลิก / หักล้างเป็น 0"
                : "ยอดขายรวมก่อนหักค่าธรรมเนียม"
          }
          tone={result.summary.income < 0 ? "negative" : "brand"}
          icon={<IconTrend size={19} />}
        />
        <StatCard
          label="สรุปค่าขนส่ง (ยอดสุทธิ)"
          value={
            result.summary.shippingNet > 0
              ? `+${formatTHB(result.summary.shippingNet)}`
              : formatTHB(result.summary.shippingNet)
          }
          hint={
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight font-medium">
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-700">
                <span>รับมา:</span>
                <strong className="font-bold">
                  <CompactValueToggle
                    value={`+${formatTHB(result.summary.shippingPositive)}`}
                  />
                </strong>
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-rose-600">
                <span>จ่ายจริง:</span>
                <strong className="font-bold">
                  <CompactValueToggle
                    value={formatTHB(result.summary.shippingNegative)}
                  />
                </strong>
              </span>
            </div>
          }
          tone={
            result.summary.shippingNet < 0
              ? "negative"
              : result.summary.shippingNet > 0
                ? "positive"
                : "default"
          }
          icon={<IconTruck size={19} />}
        />
        <StatCard
          label={
            channel === "Facebook"
              ? "หักค่าธรรมเนียม (ไม่มี)"
              : category === "refund_fee"
                ? "ค่าขนส่งตีกลับ / ค่าธรรมเนียม"
                : "หักค่าธรรมเนียมรวม"
          }
          value={formatTHB(result.summary.fees)}
          hint={
            channel === "Facebook"
              ? "ช่องทาง Facebook ไม่มีหักค่าธรรมเนียมแพลตฟอร์ม"
              : category === "refund_fee"
                ? "ค่าส่งขาไป-ขากลับและค่าธรรมเนียมที่ถูกหัก"
                : category === "normal" &&
                    !q &&
                    !createdDate &&
                    channel === "all" &&
                    status === "all" &&
                    linkStatus === "all" &&
                    result.categoryCounts.refundFee > 0
                  ? (
                      <>
                        รวมค่าส่งตีกลับ ({result.categoryCounts.refundFee} ใบ) ={" "}
                        <CompactValueToggle
                          value={formatTHB(result.periodNetSummary.orderFees)}
                        />
                      </>
                    )
                  : "ค่าธรรมเนียมแพลตฟอร์มทั้งหมด"
          }
          tone={result.summary.fees < 0 ? "negative" : "default"}
          icon={<IconAlert size={19} />}
        />
        <StatCard
          label={
            category === "refund_fee"
              ? "ยอดถูกหักสุทธิ (คืนเงิน/ตีกลับ)"
              : "ยอดชำระสุทธิ (รับจริง)"
          }
          value={formatTHB(result.summary.payout)}
          hint={
            category === "normal" &&
            !q &&
            !createdDate &&
            channel === "all" &&
            status === "all" &&
            linkStatus === "all" &&
            (result.categoryCounts.refundFeePayout !== 0 ||
              result.periodNetSummary.otherPayout !== 0) ? (
              <>
                สุทธิหลังหักตีกลับ{" "}
                <CompactValueToggle
                  value={formatTHB(result.periodNetSummary.orderPayout)}
                />
                {result.periodNetSummary.otherPayout !== 0 ? (
                  <>
                    {" "}
                    · รวมชดเชย{" "}
                    <CompactValueToggle
                      value={formatTHB(result.periodNetSummary.totalPayout)}
                    />
                  </>
                ) : null}
              </>
            ) : (
              dateScopeText
            )
          }
          tone={result.summary.payout < 0 ? "negative" : "positive"}
          icon={<IconWallet size={19} />}
        />
        <StatCard
          label="จำนวนรายการที่แสดง"
          value={`${result.total.toLocaleString("th-TH")} รายการ`}
          hint={
            isMonthSelected
              ? `ของเดือน ${formatYearMonthLabel(date)} (${distinctDates} วัน · รวมทุกหมวด ${result.periodNetSummary.orderCount.toLocaleString("th-TH")} ใบ)`
              : isYearSelected
                ? `ของปี ${date} (${distinctDates} วัน · รวมทุกหมวด ${result.periodNetSummary.orderCount.toLocaleString("th-TH")} ใบ)`
                : date
                  ? `ของวันที่ ${formatDate(date)} (รวมทุกหมวด ${result.periodNetSummary.orderCount.toLocaleString("th-TH")} ใบ)`
                  : createdDate
                    ? `ของวันสั่งซื้อ ${formatDate(createdDate)}`
                    : distinctDates > 0
                      ? `รวมทั้งหมดจาก ${distinctDates} วันชำระ (รวมทุกหมวด ${result.periodNetSummary.orderCount.toLocaleString("th-TH")} ใบ)`
                      : "แสดงหน้าละ 20 รายการ"
          }
          tone="default"
          icon={<IconReceipt size={19} />}
        />
      </div>

      <Card className="workspace-table-card">
        <BillsFilterProvider
          category={category}
          linkStatus={linkStatus}
          channel={channel}
          status={status}
        >
          <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
            {/* ชั้นที่ 1 (ใหญ่สุด): เลือกแพลตฟอร์ม / ช่องทางจำหน่าย + สถานะยอด */}
            <BillsChannelBar
              channelCounts={result.channelCounts}
              total={result.total}
              q={q}
              channelHrefs={{
                all: buildHref({
                  nextChannel: "all",
                  nextLink: "all",
                  nextPage: 1,
                }),
                TikTok: buildHref({
                  nextChannel: "TikTok",
                  nextLink: "all",
                  nextPage: 1,
                }),
                Shopee: buildHref({
                  nextChannel: "Shopee",
                  nextLink: "all",
                  nextStatus: "all",
                  nextPage: 1,
                }),
                Facebook: buildHref({
                  nextChannel: "Facebook",
                  nextLink: "all",
                  nextStatus: "all",
                  nextPage: 1,
                }),
              }}
              statusHrefs={{
                all: buildHref({ nextStatus: "all", nextPage: 1 }),
                ok: buildHref({ nextStatus: "ok", nextPage: 1 }),
                mismatch: buildHref({ nextStatus: "mismatch", nextPage: 1 }),
              }}
            />

            {/* ชั้นที่ 2: เลือกประเภทบิลหลัก 3 หมวด: บิลขายปกติ | คืนเงิน/ตีกลับ/ขาดทุน (ติดลบ) | ยกเลิก/ยอด 0 บาท */}
            <BillsCategoryTabs
              categoryCounts={result.categoryCounts}
              hrefs={{
                normal: buildHref({
                  nextCategory: "normal",
                  nextLink: "all",
                  nextPage: 1,
                }),
                refund_fee: buildHref({
                  nextCategory: "refund_fee",
                  nextLink: "all",
                  nextPage: 1,
                }),
                zero: buildHref({
                  nextCategory: "zero",
                  nextLink: "all",
                  nextPage: 1,
                }),
              }}
            />

            {/* ชั้นที่ 3: สถานะความครบของข้อมูล (เปลี่ยนตามช่องทางและหมวดอัตโนมัติ) */}
            <BillsSubFilters
              linkCounts={result.linkCounts}
              linkHrefs={{
                all: buildHref({ nextLink: "all", nextPage: 1 }),
                linked: buildHref({ nextLink: "linked", nextPage: 1 }),
                unlinked: buildHref({ nextLink: "unlinked", nextPage: 1 }),
                oms_only: buildHref({ nextLink: "oms_only", nextPage: 1 }),
                no_price: buildHref({ nextLink: "no_price", nextPage: 1 }),
                all_fb: buildHref({ nextLink: "all_fb", nextPage: 1 }),
                shopee_negative: buildHref({
                  nextLink: "shopee_negative",
                  nextPage: 1,
                }),
                shopee_zero: buildHref({
                  nextLink: "shopee_zero",
                  nextPage: 1,
                }),
              }}
            />

            {/* ชั้นที่ 4 (ล่างสุดก่อนเข้าตาราง): ค้นหา + เลือกเดือน/วันจากปฏิทิน + พิมพ์ใบกำกับฯ */}
            <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2.5">
              <span className="text-[11.5px] font-extrabold tracking-tight text-[#334155]">
                4. ค้นหาและเลือกช่วงวันชำระ (Search & Date)
              </span>
              <FilterForm className="flex max-w-[1140px] flex-wrap items-center gap-2">
                {channel !== "all" ? (
                  <input type="hidden" name="channel" value={channel} />
                ) : null}
                {status !== "all" ? (
                  <input type="hidden" name="status" value={status} />
                ) : null}
                {linkStatus !== "all" ? (
                  <input type="hidden" name="link" value={linkStatus} />
                ) : null}
                {category !== "normal" ? (
                  <input type="hidden" name="category" value={category} />
                ) : null}
                {sort !== "latest" ? (
                  <input type="hidden" name="sort" value={sort} />
                ) : null}
                {createdDate ? (
                  <input type="hidden" name="createdDate" value={createdDate} />
                ) : null}
                <div className="field h-10 w-full bg-white min-[640px]:min-w-[240px] min-[640px]:max-w-[420px] min-[640px]:flex-1">
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
                  className="w-full min-[640px]:w-auto"
                  extraParams={{
                    q: q || undefined,
                    createdDate: createdDate || undefined,
                    channel: channel !== "all" ? channel : undefined,
                    status: status !== "all" ? status : undefined,
                    link: linkStatus !== "all" ? linkStatus : undefined,
                    category: category !== "normal" ? category : undefined,
                    sort: sort !== "latest" ? sort : undefined,
                  }}
                />

                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  className={`h-10 min-h-[40px] flex-1 shrink-0 min-[640px]:flex-initial ${
                    channel === "Shopee"
                      ? "bg-[#ee4d2d] text-white hover:bg-[#d73211]"
                      : channel === "Facebook"
                        ? "bg-[#1877F2] text-white hover:bg-[#166fe5]"
                        : ""
                  }`}
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
                    <Link href="/bills" scroll={false} prefetch>
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
                {printTargetPeriod ? (
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="h-10 min-h-[40px] w-full shrink-0 min-[640px]:w-auto"
                  >
                    <Link
                      href={
                        channel !== "all"
                          ? `/days/${printTargetPeriod}/invoices?channel=${encodeURIComponent(channel)}`
                          : `/days/${printTargetPeriod}/invoices`
                      }
                    >
                      <IconReceipt size={15} />{" "}
                      {isMonthSelected || !date
                        ? `พิมพ์ทั้งเดือน (${formatYearMonthLabel(printTargetPeriod)})`
                        : `พิมพ์ทั้งวัน (${formatDateLong(printTargetPeriod)})`}
                    </Link>
                  </Button>
                ) : null}
              </FilterForm>
            </div>

            {createdDate ? (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs">
                <span className="font-bold text-foreground">
                  กำลังกรองเฉพาะบิลที่สั่งซื้อวันที่{" "}
                  <strong className="font-extrabold text-primary">
                    {formatDateLong(createdDate)} ({formatDate(createdDate)})
                  </strong>{" "}
                  จำนวน {result.total.toLocaleString("th-TH")} รายการ
                </span>
                <Link
                  href={buildHref({ nextCreatedDate: "", nextPage: 1 })}
                  scroll={false}
                  className="font-extrabold text-primary underline underline-offset-2 hover:opacity-80"
                >
                  ยกเลิกตัวกรองวันสั่งซื้อ ×
                </Link>
              </div>
            ) : null}
          </div>

        <TableLoadingBoundary
          rows={12}
          columns={7}
          label="กำลังโหลดรายการคำสั่งซื้อ..."
        >
          {result.rows.length === 0 ? (
          <div className="flex min-h-[560px] flex-col items-center justify-center p-6">
            <EmptyState
              icon={<IconReceipt size={28} />}
              title="ไม่พบบิลในหมวดที่เลือก"
              description={
                category === "normal" &&
                (result.categoryCounts.refundFee > 0 ||
                  result.categoryCounts.zero > 0)
                  ? `ไม่พบในหมวดบิลขายปกติ แต่พบในหมวด คืนเงิน/ตีกลับ (${result.categoryCounts.refundFee} รายการ) หรือ ยกเลิก 0 บาท (${result.categoryCounts.zero} รายการ)`
                  : hasFilters
                    ? "ลองเปลี่ยนหมวดบิล วันที่ สถานะ ล้างตัวกรอง หรือค้นหาด้วยหมายเลขคำสั่งซื้อบางส่วน"
                    : "ยังไม่มีบิลในระบบ เริ่มต้นด้วยการอัปโหลดไฟล์รายได้จาก TikTok Shop"
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {category !== "refund_fee" &&
                  result.categoryCounts.refundFee > 0 ? (
                    <Button asChild variant="default">
                      <Link
                        href={buildHref({
                          nextCategory: "refund_fee",
                          nextLink: "all",
                          nextPage: 1,
                        })}
                        scroll={false}
                      >
                        ดูหมวดคืนเงิน / ตีกลับ ({result.categoryCounts.refundFee})
                      </Link>
                    </Button>
                  ) : null}
                  {category !== "zero" && result.categoryCounts.zero > 0 ? (
                    <Button asChild variant="outline">
                      <Link
                        href={buildHref({
                          nextCategory: "zero",
                          nextLink: "all",
                          nextPage: 1,
                        })}
                        scroll={false}
                      >
                        ดูหมวดยกเลิก / ยอด 0 บาท ({result.categoryCounts.zero})
                      </Link>
                    </Button>
                  ) : null}
                  {hasFilters ? (
                    <Button asChild variant="secondary">
                      <Link href="/bills" scroll={false} prefetch>
                        ล้างตัวกรองทั้งหมด
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="default">
                      <Link href="/import" prefetch>
                        <IconUpload size={17} /> อัปโหลดไฟล์แรก
                      </Link>
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        ) : (
          <>
            {(() => {
              const isFb = channel === "Facebook";
              const colOrderClass = isFb
                ? "min-[768px]:w-[30%] min-[900px]:w-[22%] min-[900px]:min-w-[200px]"
                : "min-[768px]:w-[30%] min-[900px]:w-[20%] min-[900px]:min-w-[190px]";
              const colSkuClass = isFb
                ? "min-[768px]:w-[35%] min-[900px]:w-[30%] min-[900px]:min-w-[240px]"
                : "min-[768px]:w-[35%] min-[900px]:w-[25%] min-[900px]:min-w-[230px]";
              const colIncomeClass = isFb
                ? "num min-[768px]:max-[899px]:hidden min-[900px]:w-[11%] min-[900px]:min-w-[100px]"
                : "num min-[768px]:max-[899px]:hidden min-[900px]:w-[10%] min-[900px]:min-w-[95px]";
              const colShippingClass = isFb
                ? "num min-[768px]:max-[899px]:hidden min-[900px]:w-[13%] min-[900px]:min-w-[125px]"
                : "num min-[768px]:max-[899px]:hidden min-[900px]:w-[12%] min-[900px]:min-w-[120px]";
              const colFeeClass =
                "num min-[768px]:max-[899px]:hidden min-[900px]:w-[10%] min-[900px]:min-w-[95px]";
              const colPayoutClass = isFb
                ? "num min-[768px]:w-[17%] min-[900px]:w-[12%] min-[900px]:min-w-[110px]"
                : "num min-[768px]:w-[17%] min-[900px]:w-[11%] min-[900px]:min-w-[105px]";
              const colActionsClass = isFb
                ? "num min-[768px]:w-[18%] min-[900px]:w-[12%] min-[900px]:min-w-[130px]"
                : "num min-[768px]:w-[18%] min-[900px]:w-[12%] min-[900px]:min-w-[130px]";

              return (
                <BillPreviewProvider>
                  <Table
                    variant="stack"
                    className="bills-table-animated min-[768px]:table-fixed"
                  >
                  <TableHeader>
                    <TableRow>
                      <TableHead className={colOrderClass}>
                        <Link
                          href={buildHref({
                            nextSort: sort === "latest" ? "oldest" : "latest",
                            nextPage: 1,
                          })}
                          scroll={false}
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
                      <TableHead className={colSkuClass}>
                        รายการสินค้า (SKU)
                      </TableHead>
                      <TableHead className={colIncomeClass}>
                        <Link
                          href={buildHref({
                            nextSort:
                              sort === "income_asc"
                                ? "income_desc"
                                : "income_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
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
                      <TableHead className={colShippingClass}>
                        ค่าขนส่ง
                      </TableHead>
                      {channel !== "Facebook" ? (
                        <TableHead className={colFeeClass}>
                          <Link
                            href={buildHref({
                              nextSort:
                                sort === "fee_asc" ? "fee_desc" : "fee_asc",
                              nextPage: 1,
                            })}
                            scroll={false}
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
                      ) : null}
                      <TableHead className={colPayoutClass}>
                        <Link
                          href={buildHref({
                            nextSort:
                              sort === "payout_asc"
                                ? "payout_desc"
                                : "payout_asc",
                            nextPage: 1,
                          })}
                          scroll={false}
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
                      <TableHead className={colActionsClass}>เอกสาร</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {result.rows.map((row) => {
                  const ok =
                    Math.abs(row.checks.incomeDiff) < 0.01 &&
                    Math.abs(row.checks.feeDiff) < 0.01 &&
                    Math.abs(row.checks.payoutDiff) < 0.01;
                  return (
                    <BillTableRow key={row.id} row={row} className="min-[768px]:[&>td]:align-top">
                      <TableCell
                        data-label="หมายเลขคำสั่งซื้อ / ช่องทาง"
                        className={colOrderClass}
                      >
                        <div className="flex flex-col gap-1.5 max-[767px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1.5 leading-none">
                            <span className="mono text-[12.5px] min-[1280px]:text-[13px] font-bold text-[#0f172a] group-hover:text-primary group-hover:underline">
                              {row.externalId.includes("|")
                                ? row.orderCode ||
                                  row.externalId.split("|")[0] ||
                                  row.externalId
                                : row.externalId}
                            </span>
                            <CopyButton value={row.externalId} />
                          </span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1 max-[767px]:justify-end">
                            <Badge
                              variant={
                                row.channel === "Shopee"
                                  ? "shopee"
                                  : row.channel === "Facebook"
                                    ? "facebook"
                                    : "default"
                              }
                              size="sm"
                              className="shrink-0 px-1.5 py-0 text-[11px]"
                            >
                              {row.channel === "Shopee"
                                ? "Shopee"
                                : row.channel === "Facebook"
                                  ? "Facebook"
                                  : "TikTok"}
                            </Badge>
                            {row.isNoProductPriceOrder ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="shrink-0 border-[#c4b5fd] bg-[#f5f3ff] px-1.5 py-0 text-[11px] font-semibold text-[#6d28d9]"
                              >
                                เปลี่ยนสินค้า · ไม่ยื่นภาษี
                              </Badge>
                            ) : row.channel === "Shopee" &&
                              row.payout <= 0 &&
                              row.income > 0 &&
                              Math.abs(row.feeTotal) >= row.income - 0.01 ? (
                              <Badge
                                variant="danger"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                ตีกลับเต็มจำนวน 100%
                              </Badge>
                            ) : row.channel === "Shopee" && row.payout < 0 ? (
                              <Badge
                                variant="danger"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                หักคืน/ต้นทุนติดลบ
                              </Badge>
                            ) : row.income < 0 ? (
                              <Badge
                                variant="danger"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                คืนเงินหลังโอน
                              </Badge>
                            ) : row.income === 0 &&
                              (row.feeTotal < 0 || row.payout < 0) ? (
                              <Badge
                                variant="warning"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                ตีกลับเสียค่าส่ง
                              </Badge>
                            ) : row.income === 0 &&
                              row.feeTotal === 0 &&
                              row.payout === 0 ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                ยกเลิก 0 บาท
                              </Badge>
                            ) : null}
                            {row.orderCode ? (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className="mono shrink-0 border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0 text-[11px] font-semibold text-[#1e293b]"
                              >
                                ผูก #{row.orderCode}
                              </Badge>
                            ) : (
                              <Badge
                                variant="warning"
                                size="sm"
                                className="shrink-0 px-1.5 py-0 text-[11px]"
                              >
                                รอผูก ออเดอร์ใน shipnity
                              </Badge>
                            )}
                            {row.customerName ? (
                              <span
                                className="min-w-0 max-w-[120px] min-[1280px]:max-w-[170px] truncate text-[11.5px] font-medium text-[#475569] max-[767px]:max-w-[140px]"
                                title={row.customerName}
                              >
                                · {row.customerName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="รายการสินค้า (SKU)"
                        className={colSkuClass}
                      >
                        {row.omsItems && row.omsItems.length > 0 ? (
                          <div className="flex w-full flex-col gap-1 text-xs max-[767px]:items-end">
                            {row.omsItems.slice(0, 2).map((item, idx) => (
                              <div
                                key={`${item.skuCode}-${idx}`}
                                className="flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-[#e2e8f0] bg-[#f8fafc]/80 px-2 py-1"
                                title={`${item.skuCode} · ${item.productName} (×${item.quantity})`}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                  <span className="mono shrink-0 rounded border border-[#cbd5e1] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#0f172a] shadow-2xs">
                                    {item.skuCode}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium text-[#1e293b]">
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
                            {row.omsItems.length > 2 ? (
                              <BillPreviewTrigger
                                row={row}
                                defaultTab="bill"
                                triggerVariant="link"
                                label={`+${row.omsItems.length - 2} รายการอื่นในบิลนี้`}
                                className="min-h-0 w-fit rounded-md bg-[#f1f5f9] px-2 py-0.5 font-sans text-[11px] font-semibold text-[#475569] no-underline hover:bg-[#e2e8f0] hover:text-[#0f172a] hover:no-underline"
                              />
                            ) : null}
                          </div>
                        ) : !row.productDetail || row.productDetail.trim() === "/" ? (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                            <span className="text-[11px] font-semibold text-[#b45309]">
                              ({formatDate(row.createdDate)})
                            </span>
                          </div>
                        ) : /^\d{10,}\s*\*\s*\d+/.test(row.productDetail.trim()) ? (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span className="mono font-semibold text-[#0f172a]">
                              {row.productDetail.replace(/;\s*$/, "")}
                            </span>
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                          </div>
                        ) : (
                          <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-center text-xs font-medium text-[#92400e] text-balance">
                            <span className="font-semibold text-[#0f172a]">
                              {row.productDetail}
                            </span>
                            <span>รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        data-label="รายได้"
                        className={cn(
                          colIncomeClass,
                          "font-semibold",
                          row.income < 0
                            ? "danger"
                            : row.income === 0
                              ? "text-[#64748b]"
                              : "text-[#0f172a]",
                        )}
                      >
                        <div className="min-[768px]:pt-1">
                          {formatTHB(row.income)}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ค่าขนส่ง"
                        className={cn(colShippingClass, "font-semibold")}
                      >
                        {(() => {
                          const ship = getRowShippingSummary(row);
                          const hasBoth =
                            ship.positiveAmount > 0 && ship.negativeAmount < 0;
                          return (
                            <div className="flex flex-col items-end gap-0.5 min-[768px]:pt-1 leading-tight">
                              <span
                                className={`inline-flex items-center gap-1 font-bold ${
                                  ship.netAmount < 0
                                    ? "text-rose-600 dark:text-rose-400"
                                    : ship.netAmount > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-[#64748b]"
                                }`}
                              >
                                {hasBoth ? (
                                  <span className="text-[10px] font-medium text-slate-500">
                                    {ship.netAmount === 0
                                      ? "เท่าทุน"
                                      : "ส่วนต่าง"}
                                  </span>
                                ) : null}
                                <span>
                                  {ship.netAmount > 0
                                    ? `+${formatTHB(ship.netAmount)}`
                                    : formatTHB(ship.netAmount)}
                                </span>
                              </span>
                              {hasBoth ? (
                                <div className="flex flex-col items-end text-[10px] leading-tight font-medium text-slate-500">
                                  <span className="whitespace-nowrap">
                                    รับ{" "}
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                      +{formatTHB(ship.positiveAmount)}
                                    </span>
                                  </span>
                                  <span className="whitespace-nowrap">
                                    จ่าย{" "}
                                    <span className="font-bold text-rose-600 dark:text-rose-400">
                                      {formatTHB(ship.negativeAmount)}
                                    </span>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </TableCell>
                      {channel !== "Facebook" ? (
                        <TableCell
                          data-label="ค่าธรรมเนียม"
                          className={cn(
                            colFeeClass,
                            "font-semibold",
                            row.feeTotal < 0 ? "danger" : "text-[#64748b]",
                          )}
                        >
                          <div className="flex flex-col items-end gap-0.5 min-[768px]:pt-1">
                            <span>
                              {row.channel === "Facebook"
                                ? "-"
                                : formatTHB(row.feeTotal)}
                            </span>
                            {row.channel !== "Facebook" &&
                            row.feeTotal === 0 &&
                            row.normalized.transactionType ===
                              "คำสั่งซื้อ (OMS)" ? (
                              <span className="max-w-[115px] whitespace-normal text-right text-[10px] leading-tight font-normal text-muted-foreground">
                                {row.channel === "Shopee"
                                  ? "(ออเดอร์ Shopee จาก shipnity)"
                                  : "(ยังไม่มีข้อมูลรายได้จาก TikTok)"}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell
                        data-label="ยอดชำระสุทธิ"
                        className={cn(
                          colPayoutClass,
                          "payout-col font-extrabold text-[13.5px] min-[1280px]:text-[14px]",
                          row.payout < 0
                            ? "danger"
                            : row.payout === 0
                              ? "text-[#64748b]"
                              : "positive",
                        )}
                      >
                        <div className="flex flex-col items-end gap-1 min-[768px]:pt-0.5">
                          <span className="leading-snug">{formatTHB(row.payout)}</span>
                          <span className="hidden text-[11px] font-normal text-muted-foreground min-[768px]:max-[899px]:inline">
                            รับ {formatTHB(row.income)} · หัก {formatTHB(row.feeTotal)}
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
                      <TableCell data-label="เอกสาร" className={cn(colActionsClass, "num")}>
                        <div className="inline-flex flex-nowrap items-center justify-end rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-0.5 shadow-2xs whitespace-nowrap">
                          <BillPreviewTrigger
                            row={row}
                            defaultTab="bill"
                            triggerVariant="ghost"
                            label="ดูบิล"
                            className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-white px-2 text-xs font-bold text-[#0f172a] shadow-2xs hover:bg-[#f1f5f9] hover:text-primary"
                          />
                          {isOrderEligibleForInvoice(row) ? (
                            <>
                              <span
                                aria-hidden="true"
                                className="mx-0.5 h-4 w-px shrink-0 bg-[#cbd5e1]/80"
                              />
                              <BillPreviewTrigger
                                row={row}
                                defaultTab="invoice"
                                triggerVariant="ghost"
                                label="ใบกำกับฯ"
                                className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-transparent px-2 text-xs font-semibold text-[#334155] shadow-none hover:bg-white hover:text-[#0f172a] hover:shadow-2xs"
                              />
                              {row.sellerSettings?.enableFullTaxInvoice ===
                              true ? (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className="mx-0.5 h-4 w-px shrink-0 bg-[#cbd5e1]/80"
                                  />
                                  <BillPreviewTrigger
                                    row={row}
                                    defaultTab="invoice_full"
                                    triggerVariant="ghost"
                                    label="ใบเต็ม"
                                    className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-transparent px-2 text-xs font-semibold text-[#334155] shadow-none hover:bg-white hover:text-[#0f172a] hover:shadow-2xs"
                                  />
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </BillTableRow>
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
                    {isMonthSelected
                      ? `รวมเดือน ${formatYearMonthLabel(date)} (${result.total.toLocaleString("th-TH")} รายการ)`
                      : isYearSelected
                        ? `รวมปี ${date} (${result.total.toLocaleString("th-TH")} รายการ)`
                        : date
                          ? `รวมวันที่ ${formatDateLong(date)} (${result.total.toLocaleString("th-TH")} รายการ)`
                          : `รวมทั้งหมด (${result.total.toLocaleString("th-TH")} รายการ)`}
                  </TableCell>
                  <TableCell
                    data-label="รวมรายได้"
                    className={cn(
                      colIncomeClass,
                      "font-bold",
                      result.summary.income < 0
                        ? "danger"
                        : result.summary.income === 0
                          ? "text-[#64748b]"
                          : "text-[#0f172a]",
                    )}
                  >
                    <CompactValueToggle value={formatTHB(result.summary.income)} />
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าขนส่ง (สุทธิ)"
                    className={cn(
                      colShippingClass,
                      "font-bold",
                      result.summary.shippingNet < 0
                        ? "danger"
                        : result.summary.shippingNet > 0
                          ? "positive"
                          : "text-[#64748b]",
                    )}
                  >
                    <div className="flex flex-col items-end gap-0.5 leading-tight">
                      <span>
                        <CompactValueToggle
                          value={
                            result.summary.shippingNet > 0
                              ? `+${formatTHB(result.summary.shippingNet)}`
                              : formatTHB(result.summary.shippingNet)
                          }
                        />
                      </span>
                      <div className="flex flex-col items-end text-[10px] leading-tight font-medium text-slate-500">
                        {result.summary.shippingPositive > 0 ? (
                          <span className="whitespace-nowrap">
                            รับ{" "}
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              <CompactValueToggle
                                value={`+${formatTHB(result.summary.shippingPositive)}`}
                              />
                            </span>
                          </span>
                        ) : null}
                        {result.summary.shippingNegative < 0 ? (
                          <span className="whitespace-nowrap">
                            จ่าย{" "}
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              <CompactValueToggle
                                value={formatTHB(result.summary.shippingNegative)}
                              />
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  {channel !== "Facebook" ? (
                    <TableCell
                      data-label="รวมค่าธรรมเนียม"
                      className={cn(
                        colFeeClass,
                        "font-bold",
                        result.summary.fees < 0 ? "danger" : "text-[#64748b]",
                      )}
                    >
                      <CompactValueToggle value={formatTHB(result.summary.fees)} />
                    </TableCell>
                  ) : null}
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className={cn(
                      colPayoutClass,
                      "payout-col font-extrabold text-[14px]",
                      result.summary.payout < 0
                        ? "danger"
                        : result.summary.payout === 0
                          ? "text-[#64748b]"
                          : "positive",
                    )}
                  >
                    <CompactValueToggle value={formatTHB(result.summary.payout)} />
                  </TableCell>
                  <TableCell data-label="" className={cn(colActionsClass, "max-[767px]:hidden")} />
                </TableRow>
              </TableFooter>
            </Table>
          </BillPreviewProvider>
        );
        })()}

            <PaginationBar
              page={result.page}
              pageCount={result.pageCount}
              pageSize={result.pageSize}
              total={result.total}
              unitLabel="รายการ"
              basePath="/bills"
              extraParams={{
                q: q || undefined,
                date: date || undefined,
                createdDate: createdDate || undefined,
                channel: channel !== "all" ? channel : undefined,
                status: status !== "all" ? status : undefined,
                link: linkStatus !== "all" ? linkStatus : undefined,
                category: category !== "normal" ? category : undefined,
                sort: sort !== "latest" ? sort : undefined,
              }}
            />
          </>
        )}
        </TableLoadingBoundary>
        </BillsFilterProvider>
      </Card>
    </div>
  );
}
