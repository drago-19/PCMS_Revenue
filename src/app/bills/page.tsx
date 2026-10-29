import Link from "next/link";
import { BillPreviewTrigger } from "@/components/BillPreviewDialog";
import { CompactValueToggle } from "@/components/CompactValueToggle";
import { CopyButton } from "@/components/CopyButton";
import { DatePickerField } from "@/components/DatePickerField";
import { FilterForm } from "@/components/FilterForm";
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
import {
  type BillCategoryKey,
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
  const channel: "all" | "TikTok" | "Shopee" =
    rawChannel === "TikTok" || rawChannel === "Shopee" ? rawChannel : "all";
  const rawStatus = (params.status ?? "all").trim();
  const status: "all" | "ok" | "mismatch" =
    rawStatus === "ok" || rawStatus === "mismatch" ? rawStatus : "all";
  const rawLink = (params.link ?? "all").trim();
  const linkStatus: "all" | "linked" | "unlinked" | "oms_only" =
    rawLink === "linked" || rawLink === "unlinked" || rawLink === "oms_only"
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
    nextChannel?: "all" | "TikTok" | "Shopee";
    nextStatus?: "all" | "ok" | "mismatch";
    nextLink?: "all" | "linked" | "unlinked" | "oms_only";
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
        eyebrow="TikTok Shop & Shopee · Order Settlements"
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
          label={
            category === "refund_fee"
              ? "ค่าขนส่งตีกลับ / ค่าธรรมเนียม"
              : "หักค่าธรรมเนียมรวม"
          }
          value={formatTHB(result.summary.fees)}
          hint={
            category === "refund_fee"
              ? "ค่าส่งขาไป-ขากลับและค่าธรรมเนียมที่ถูกหัก"
              : category === "normal" &&
                  !q &&
                  !createdDate &&
                  channel === "all" &&
                  status === "all" &&
                  linkStatus === "all" &&
                  result.categoryCounts.refundFee > 0
                ? `รวมค่าส่งตีกลับ (${result.categoryCounts.refundFee} ใบ) = ${formatTHB(result.periodNetSummary.orderFees)}`
                : "ค่าธรรมเนียมแพลตฟอร์มทั้งหมด"
          }
          tone="negative"
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
              result.periodNetSummary.otherPayout !== 0)
              ? `สุทธิหลังหักตีกลับ ${formatTHB(result.periodNetSummary.orderPayout)}${
                  result.periodNetSummary.otherPayout !== 0
                    ? ` · รวมชดเชย ${formatTHB(result.periodNetSummary.totalPayout)}`
                    : ""
                }`
              : dateScopeText
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
        <div className="shrink-0 rounded-t-2xl border-b border-border bg-[#f8fafc] px-4 py-3 min-[640px]:px-5">
          {/* แท็บหมวดบิลหลัก 3 หมวด: บิลขายปกติ | คืนเงิน/ตีกลับ (ถูกหักเงิน) | ยกเลิก/ยอด 0 บาท */}
          <div
            role="tablist"
            aria-label="หมวดประเภทบิลคำสั่งซื้อ"
            className="mb-3 grid grid-cols-1 gap-1.5 rounded-xl border border-border bg-white p-1.5 shadow-2xs min-[640px]:grid-cols-3"
          >
            {[
              {
                key: "normal" as const,
                label: "บิลขายปกติ",
                subLabel: "มีรายได้ · ออกใบกำกับภาษี",
                count: result.categoryCounts.normal,
                dotColor: "bg-[#059669]",
                activeClass:
                  "border-primary bg-primary text-white shadow-xs",
              },
              {
                key: "refund_fee" as const,
                label: "คืนเงิน / ตีกลับ (ถูกหักเงิน)",
                subLabel:
                  result.categoryCounts.refundFeePayout !== 0
                    ? `ถูกหักสุทธิ ${formatTHB(result.categoryCounts.refundFeePayout)}`
                    : "คืนเงินหลังโอน / เสียค่าส่งตีกลับ",
                count: result.categoryCounts.refundFee,
                dotColor: "bg-[#dc2626]",
                activeClass:
                  "border-[#dc2626] bg-[#dc2626] text-white shadow-xs",
              },
              {
                key: "zero" as const,
                label: "ยกเลิก / ยอด 0 บาท",
                subLabel: "ยกเลิกหรือไม่เสียค่าธรรมเนียม",
                count: result.categoryCounts.zero,
                dotColor: "bg-[#64748b]",
                activeClass:
                  "border-[#334155] bg-[#334155] text-white shadow-xs",
              },
            ].map((tab) => {
              const active = category === tab.key;
              return (
                <Link
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  scroll={false}
                  href={buildHref({
                    nextCategory: tab.key,
                    nextLink: "all",
                    nextPage: 1,
                  })}
                  className={
                    active
                      ? `flex min-h-[44px] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 transition-colors ${tab.activeClass}`
                      : "flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-transparent bg-[#f8fafc] px-3 py-1.5 text-[#0f172a] transition-colors hover:border-[#cbd5e1] hover:bg-[#f1f5f9]"
                  }
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        active ? "bg-white" : tab.dotColor
                      }`}
                    />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-xs font-bold">
                        {tab.label}
                      </span>
                      <span
                        className={`truncate text-[11px] ${
                          active ? "text-white/85" : "text-muted-foreground"
                        }`}
                      >
                        {tab.subLabel}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`mono shrink-0 rounded-md px-2 py-0.5 text-xs font-extrabold ${
                      active
                        ? "bg-white/20 text-white"
                        : "border border-[#e2e8f0] bg-white text-[#0f172a]"
                    }`}
                  >
                    <CompactValueToggle
                      value={tab.count.toLocaleString("th-TH")}
                      stopPropagationOnClick
                    />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* แถวที่ 1: ค้นหา + เลือกเดือน/วันจากปฏิทิน + พิมพ์ใบกำกับฯ */}
          <FilterForm className="flex flex-wrap items-center gap-2">
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
            <div className="field h-10 w-full bg-white sm:min-w-[220px] sm:w-auto sm:flex-1">
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
              className="w-full sm:w-auto"
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
              className="h-10 min-h-[40px] flex-1 shrink-0 sm:flex-initial"
            >
              <IconSearch size={15} /> ค้นหา
            </Button>
            {hasFilters ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-10 min-h-[40px] flex-1 shrink-0 sm:flex-initial"
              >
                <Link href="/bills" scroll={false}>
                  ล้างตัวกรอง
                </Link>
              </Button>
            ) : null}
            {printTargetPeriod ? (
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="h-10 min-h-[40px] w-full shrink-0 sm:w-auto"
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

          {/* แถวที่ 2: แท็บสถานะการผูกไฟล์ 4 ช่องเต็มความกว้างอย่างสมดุล */}
          <div
            role="group"
            aria-label="กรองตามสถานะการผูกไฟล์"
            className="mt-2.5 grid grid-cols-1 gap-1.5 border-t border-border/70 pt-2.5 min-[520px]:grid-cols-2 min-[960px]:grid-cols-4"
          >
            {[
              {
                key: "all" as const,
                label: "ทั้งหมด",
                subLabel: "ทุกรายการในระบบ",
                count: result.linkCounts.all,
                dotColor: "bg-[#64748b]",
              },
              {
                key: "linked" as const,
                label: "ข้อมูลครบ",
                subLabel: "พร้อมออกใบกำกับฯ",
                count: result.linkCounts.linked,
                dotColor: "bg-[#059669]",
              },
              {
                key: "unlinked" as const,
                label: "รอไฟล์ ออเดอร์ใน shipnity",
                subLabel:
                  result.linkCounts.missingOmsCreatedDates.length > 0
                    ? `วันสั่งซื้อ ${result.linkCounts.missingOmsCreatedDates
                        .slice(0, 2)
                        .map((d) => formatDate(d))
                        .join(", ")}`
                    : "มีเฉพาะยอดโอน",
                count: result.linkCounts.unlinked,
                dotColor: "bg-[#d97706]",
              },
              {
                key: "oms_only" as const,
                label: "มีเฉพาะ ออเดอร์ใน shipnity",
                subLabel: "รอไฟล์รายได้รอบโอน",
                count: result.linkCounts.omsOnly,
                dotColor: "bg-[#2563eb]",
              },
            ].map((item) => {
              const active = linkStatus === item.key;
              return (
                <Link
                  key={item.key}
                  href={buildHref({ nextLink: item.key, nextPage: 1 })}
                  scroll={false}
                  className={
                    active
                      ? "flex min-h-[42px] items-center justify-between gap-2 rounded-xl border border-primary bg-primary px-3 py-1.5 text-white shadow-xs transition-colors"
                      : "flex min-h-[42px] items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-1.5 text-[#0f172a] shadow-2xs transition-colors hover:border-[#cbd5e1] hover:bg-[#f1f5f9]"
                  }
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        active ? "bg-white" : item.dotColor
                      }`}
                    />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-xs font-bold">
                        {item.label}
                      </span>
                      <span
                        className={`truncate text-[11px] ${
                          active ? "text-white/85" : "text-muted-foreground"
                        }`}
                      >
                        {item.subLabel}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`mono shrink-0 rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-[#f1f5f9] text-[#0f172a]"
                    }`}
                  >
                    <CompactValueToggle
                      value={item.count.toLocaleString("th-TH")}
                      stopPropagationOnClick
                    />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* แถวที่ 3: ช่องทางจำหน่าย (TikTok / Shopee) + สถานะตรวจยอด + เรียงลำดับ จัดระเบียบชิดซ้าย-ขวา */}
          <div className="mt-2 flex flex-col gap-2 min-[960px]:flex-row min-[960px]:flex-wrap min-[960px]:items-center min-[960px]:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-[960px]:w-auto">
              <div
                role="group"
                aria-label="กรองตามช่องทางจำหน่าย"
                className="grid w-full grid-cols-3 items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs sm:inline-flex sm:w-auto sm:flex-wrap"
              >
                <span className="col-span-3 px-1.5 pt-0.5 text-[11px] font-bold text-[#475569] sm:col-span-1 sm:px-2 sm:pt-0 sm:text-[11.5px]">
                  ช่องทาง:
                </span>
                {[
                  {
                    key: "all" as const,
                    label: "ทุกช่องทาง",
                    count: result.channelCounts.all ?? result.total,
                    dotColor: "",
                  },
                  {
                    key: "TikTok" as const,
                    label: "TikTok",
                    count: result.channelCounts.TikTok ?? 0,
                    dotColor: "bg-primary",
                  },
                  {
                    key: "Shopee" as const,
                    label: "Shopee",
                    count: result.channelCounts.Shopee ?? 0,
                    dotColor: "bg-[#ee4d2d]",
                  },
                ].map((ch) => {
                  const active = channel === ch.key;
                  return (
                    <Button
                      key={ch.key}
                      asChild
                      variant={active ? "default" : "ghost"}
                      size="xs"
                      className={
                        active
                          ? ch.key === "Shopee"
                            ? "h-8 min-h-[32px] w-full bg-[#ee4d2d] px-2 text-white shadow-2xs hover:bg-[#d73211] sm:h-7 sm:min-h-[28px] sm:w-auto"
                            : "h-8 min-h-[32px] w-full px-2 shadow-2xs sm:h-7 sm:min-h-[28px] sm:w-auto"
                          : "h-8 min-h-[32px] w-full px-2 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:h-7 sm:min-h-[28px] sm:w-auto"
                      }
                    >
                      <Link
                        href={buildHref({ nextChannel: ch.key, nextPage: 1 })}
                        scroll={false}
                      >
                        {ch.dotColor ? (
                          <span
                            className={`size-2 shrink-0 rounded-full ${active ? "bg-white" : ch.dotColor}`}
                          />
                        ) : null}
                        <span>{ch.label}</span>
                        <span
                          className={`text-xs ${active ? "text-white/90" : "text-muted-foreground"}`}
                        >
                          (
                          <CompactValueToggle
                            value={ch.count.toLocaleString("th-TH")}
                            stopPropagationOnClick
                          />
                          )
                        </span>
                      </Link>
                    </Button>
                  );
                })}
              </div>

              <div
                className="grid w-full grid-cols-3 items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs sm:inline-flex sm:w-auto sm:flex-wrap"
                role="navigation"
                aria-label="กรองตามสถานะตรวจยอด"
              >
                <span className="col-span-3 px-1.5 pt-0.5 text-[11px] font-bold text-[#475569] sm:col-span-1 sm:px-2 sm:pt-0 sm:text-[11.5px]">
                  สถานะยอด:
                </span>
                <Button
                  asChild
                  variant={status === "all" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "all"
                      ? "h-8 min-h-[32px] w-full px-2 shadow-2xs sm:h-7 sm:min-h-[28px] sm:w-auto"
                      : "h-8 min-h-[32px] w-full px-2 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:h-7 sm:min-h-[28px] sm:w-auto"
                  }
                >
                  <Link
                    href={buildHref({ nextStatus: "all", nextPage: 1 })}
                    scroll={false}
                  >
                    ทุกสถานะยอด
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={status === "ok" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "ok"
                      ? "h-8 min-h-[32px] w-full px-2 shadow-2xs sm:h-7 sm:min-h-[28px] sm:w-auto"
                      : "h-8 min-h-[32px] w-full px-2 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:h-7 sm:min-h-[28px] sm:w-auto"
                  }
                >
                  <Link
                    href={buildHref({ nextStatus: "ok", nextPage: 1 })}
                    scroll={false}
                  >
                    <IconCheckCircle size={13} /> ยอดตรง
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={status === "mismatch" ? "default" : "ghost"}
                  size="xs"
                  className={
                    status === "mismatch"
                      ? "h-8 min-h-[32px] w-full px-2 shadow-2xs sm:h-7 sm:min-h-[28px] sm:w-auto"
                      : "h-8 min-h-[32px] w-full px-2 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:h-7 sm:min-h-[28px] sm:w-auto"
                  }
                >
                  <Link
                    href={buildHref({ nextStatus: "mismatch", nextPage: 1 })}
                    scroll={false}
                  >
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

           
          </div>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-6">
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
                      <Link href="/bills" scroll={false}>
                        ล้างตัวกรองทั้งหมด
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="default">
                      <Link href="/import">
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
            <Table variant="stack">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-[768px]:w-[215px] min-[1280px]:w-[225px]">
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
                  <TableHead>รายการสินค้า (SKU)</TableHead>
                  <TableHead className="num min-[768px]:max-[899px]:hidden">
                    <Link
                      href={buildHref({
                        nextSort:
                          sort === "income_asc" ? "income_desc" : "income_asc",
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
                  <TableHead className="num min-[768px]:max-[899px]:hidden">
                    <Link
                      href={buildHref({
                        nextSort: sort === "fee_asc" ? "fee_desc" : "fee_asc",
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
                  <TableHead className="num">
                    <Link
                      href={buildHref({
                        nextSort:
                          sort === "payout_asc" ? "payout_desc" : "payout_asc",
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
                    <TableRow key={row.id} className="min-[768px]:[&>td]:align-top">
                      <TableCell
                        data-label="หมายเลขคำสั่งซื้อ / ช่องทาง"
                        className="min-[768px]:w-[215px] min-[1280px]:w-[225px]"
                      >
                        <div className="flex flex-col gap-1.5 max-[767px]:items-end">
                          <span className="inline-flex max-w-full items-center gap-1 leading-none">
                            <BillPreviewTrigger
                              row={row}
                              defaultTab="bill"
                              triggerVariant="link"
                              className="font-bold text-[#0f172a] hover:text-primary"
                            />
                            <CopyButton value={row.externalId} />
                          </span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1 max-[767px]:justify-end">
                            <Badge
                              variant={row.channel === "Shopee" ? "shopee" : "default"}
                              size="sm"
                              className="shrink-0 px-1.5 py-0 text-[11px]"
                            >
                              {row.channel === "Shopee" ? "Shopee" : "TikTok"}
                            </Badge>
                            {row.income < 0 ? (
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
                              <Badge variant="warning" size="sm" className="shrink-0 px-1.5 py-0 text-[11px]">
                                รอผูก ออเดอร์ใน shipnity
                              </Badge>
                            )}
                            {row.customerName ? (
                              <span
                                className="min-w-0 max-w-[55px] min-[1280px]:max-w-[90px] truncate text-[11.5px] font-medium text-[#475569] max-[767px]:max-w-[140px]"
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
                      >
                        {row.omsItems && row.omsItems.length > 0 ? (
                          <div className="flex w-full flex-col gap-1 text-xs max-[767px]:items-end">
                            {row.omsItems.slice(0, 2).map((item, idx) => (
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
                        className={`num font-semibold min-[768px]:max-[899px]:hidden ${
                          row.income < 0
                            ? "danger"
                            : row.income === 0
                              ? "text-[#64748b]"
                              : "text-[#0f172a]"
                        }`}
                      >
                        <div className="min-[768px]:pt-1">
                          {formatTHB(row.income)}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ค่าธรรมเนียม"
                        className="num danger font-semibold min-[768px]:max-[899px]:hidden"
                      >
                        <div className="flex flex-col items-end gap-0.5 min-[768px]:pt-1">
                          <span>{formatTHB(row.feeTotal)}</span>
                          {row.feeTotal === 0 &&
                            row.normalized.transactionType === "คำสั่งซื้อ (OMS)" ? (
                            <span className="max-w-[115px] whitespace-normal text-right text-[10.5px] leading-tight font-normal text-muted-foreground">
                              {row.channel === "Shopee"
                                ? "(ออเดอร์ Shopee จาก shipnity)"
                                : "(ยังไม่มีข้อมูลรายได้จาก TikTok)"}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="ยอดชำระสุทธิ"
                        className={`num payout-col font-extrabold text-[13.5px] min-[1280px]:text-[14px] ${
                          row.payout < 0
                            ? "danger"
                            : row.payout === 0
                              ? "text-[#64748b]"
                              : "positive"
                        }`}
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
                      <TableCell data-label="เอกสาร" className="num">
                        <div className="inline-flex flex-nowrap items-center justify-end rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-0.5 shadow-2xs whitespace-nowrap">
                          <BillPreviewTrigger
                            row={row}
                            defaultTab="bill"
                            triggerVariant="ghost"
                            label="ดูบิล"
                            className="min-[768px]:h-7 min-[768px]:min-h-[28px] rounded-[6px] border-0 bg-white px-2 text-xs font-bold text-[#0f172a] shadow-2xs hover:bg-[#f1f5f9] hover:text-primary"
                          />
                          {row.transactionType === "คำสั่งซื้อ (OMS)" ||
                          row.income > 0 ||
                          row.payout > 0 ? (
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
                    className={`num font-bold min-[768px]:max-[899px]:hidden ${
                      result.summary.income < 0
                        ? "danger"
                        : result.summary.income === 0
                          ? "text-[#64748b]"
                          : "text-[#0f172a]"
                    }`}
                  >
                    {formatTHB(result.summary.income)}
                  </TableCell>
                  <TableCell
                    data-label="รวมค่าธรรมเนียม"
                    className="num danger font-bold min-[768px]:max-[899px]:hidden"
                  >
                    {formatTHB(result.summary.fees)}
                  </TableCell>
                  <TableCell
                    data-label="รวมยอดชำระสุทธิ"
                    className={`num payout-col font-extrabold text-[14px] ${
                      result.summary.payout < 0
                        ? "danger"
                        : result.summary.payout === 0
                          ? "text-[#64748b]"
                          : "positive"
                    }`}
                  >
                    {formatTHB(result.summary.payout)}
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
      </Card>
    </div>
  );
}
