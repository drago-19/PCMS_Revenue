import Link from "next/link";
import { notFound } from "next/navigation";
import { DatePickerField } from "@/components/DatePickerField";
import {
  InvoiceDocument,
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { InvoiceZoomControl } from "@/components/InvoiceZoomControl";
import { BatchPicker } from "@/components/BatchPicker";
import { PrintButton } from "@/components/PrintButton";
import { IconAlert, IconArrowLeft } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateLong } from "@/lib/format";
import { buildInvoice } from "@/lib/invoice";
import {
  getBulkInvoicesBatch,
  listDailyBatches,
} from "@/lib/queries";
import { getDocumentSettings } from "@/lib/settings";


const SEGMENT_GROUP =
  "w-full gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1 sm:w-auto sm:flex-wrap sm:items-center";
const SEGMENT_BASE =
  "h-8 min-h-[32px] w-full justify-center gap-1.5 px-2.5 text-xs sm:w-auto";
const SEGMENT_ON = `${SEGMENT_BASE} font-bold shadow-xs`;
const SEGMENT_OFF = `${SEGMENT_BASE} text-[#334155] hover:bg-white hover:text-[#0f172a]`;

/** แถวตั้งค่า: ป้ายกำกับคอลัมน์ซ้ายกว้างคงที่ ให้ตัวควบคุมทุกแถวเริ่มที่แนวเดียวกัน */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:grid sm:grid-cols-[104px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
export const dynamic = "force-dynamic";

export const metadata = { title: "พิมพ์ใบกำกับภาษีรวม (รายวัน / รายเดือน)" };

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

function parsePaperSize(
  raw: string | undefined,
  mode: InvoiceMode,
  defaultPaper: InvoicePaperSize,
): InvoicePaperSize {
  if (raw === "a6" || raw === "a4-4up" || raw === "80mm" || raw === "a4") {
    return raw;
  }
  return mode === "full" ? "a4" : defaultPaper;
}

export default async function BulkInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{
    mode?: string;
    paper?: string;
    link?: string;
    channel?: string;
    batch?: string;
    batchSize?: string;
  }>;
}) {
  const { date } = await params;
  const resolvedSearchParams = await searchParams;
  const rawLink = (resolvedSearchParams.link ?? "linked").trim();
  const rawChannel = (resolvedSearchParams.channel ?? "all").trim();
  const channelFilter: "all" | "TikTok" | "Shopee" | "Facebook" =
    rawChannel === "TikTok" ||
    rawChannel === "Shopee" ||
    rawChannel === "Facebook"
      ? rawChannel
      : "all";
  const rawBatchSize = Number(resolvedSearchParams.batchSize);
  const batchSize: 100 | 200 | 500 =
    rawBatchSize === 100 || rawBatchSize === 500 ? rawBatchSize : 200;

  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isMonth = /^\d{4}-\d{2}$/.test(date);
  if (!isDay && !isMonth) notFound();

  const rawBatch = Number(resolvedSearchParams.batch);

  const [bulkBatch, allBatches, settings] = await Promise.all([
    getBulkInvoicesBatch({
      date,
      channelFilter,
      rawLink,
      batch: Number.isFinite(rawBatch) && rawBatch >= 1 ? rawBatch : 1,
      batchSize,
    }),
    listDailyBatches(400),
    getDocumentSettings(),
  ]);
  if (!bulkBatch) notFound();

  const enableFullTaxInvoice = settings.enableFullTaxInvoice === true;
  const mode: InvoiceMode =
    enableFullTaxInvoice && resolvedSearchParams.mode === "full"
      ? "full"
      : "abbreviated";

  const paper = parsePaperSize(
    resolvedSearchParams.paper,
    mode,
    settings.defaultPaperSize ?? "a6",
  );

  const availableDates = allBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const {
    billableTotalCount,
    tiktokOrdersCount,
    shopeeOrdersCount,
    facebookOrdersCount,
    channelFilteredCount,
    linkedOrdersCount,
    unlinkedOrdersCount,
    effectiveLinkFilter,
    totalFilteredCount,
    batchCount,
    currentBatch,
    batchStartIdx,
    batchEndIdx,
    missingOmsDates,
    orders: pagedOrders,
  } = bulkBatch;

  const invoices = pagedOrders.map((order) => buildInvoice(order, settings));

  function buildPrintHref(overrides: {
    nextDate?: string;
    nextMode?: InvoiceMode;
    nextPaper?: InvoicePaperSize;
    nextLink?: "linked" | "all" | "unlinked";
    nextChannel?: "all" | "TikTok" | "Shopee" | "Facebook";
    nextBatch?: number;
    nextBatchSize?: 100 | 200 | 500;
  }) {
    const targetDate = overrides.nextDate ?? date;
    const search = new URLSearchParams();
    const targetMode = overrides.nextMode ?? mode;
    if (targetMode === "full") search.set("mode", "full");
    const targetPaper =
      overrides.nextPaper ?? (targetMode === "full" ? "a4" : paper);
    const defaultAbbrevPaper = settings.defaultPaperSize ?? "a6";
    if (
      (targetMode === "abbreviated" && targetPaper !== defaultAbbrevPaper) ||
      (targetMode === "full" && targetPaper !== "a4")
    ) {
      search.set("paper", targetPaper);
    }
    const targetChannel = overrides.nextChannel ?? channelFilter;
    if (targetChannel !== "all") {
      search.set("channel", targetChannel);
    }
    const targetLink = overrides.nextLink ?? effectiveLinkFilter;
    if (targetLink !== "linked") {
      search.set("link", targetLink);
    }
    const targetBatchSize = overrides.nextBatchSize ?? batchSize;
    if (targetBatchSize !== 200) {
      search.set("batchSize", String(targetBatchSize));
    }
    const targetBatch = overrides.nextBatch ?? 1;
    if (targetBatch > 1) {
      search.set("batch", String(targetBatch));
    }
    const qs = search.toString();
    return qs
      ? `/days/${targetDate}/invoices?${qs}`
      : `/days/${targetDate}/invoices`;
  }

  const pagePrintCss =
    paper === "a6"
      ? "@page { size: A6 portrait; margin: 3.5mm; }"
      : paper === "80mm"
        ? "@page { size: 80mm auto; margin: 2.5mm; }"
        : paper === "a4-4up"
          ? "@page { size: A4 portrait; margin: 5mm; }"
          : "@page { size: A4 portrait; margin: 10mm; }";

  // จัดกลุ่มแผ่น A4 แบ่ง 4 ใบ แบบคำนึงถึงความสูงจริง (Smart Height-Aware 4-Up Packing)
  // ปกติ 1 แผ่น A4 มี 2 แถว (4 ใบ) แต่ถ้าแถวใดมีออเดอร์ที่สั่งสินค้า >= 6 รายการ ให้แยกแผ่นอัตโนมัติเพื่อไม่ให้ล้นทะลุหน้า
  const chunked4Up: (typeof invoices)[] = [];
  if (mode === "abbreviated" && paper === "a4-4up") {
    const pairs: (typeof invoices)[] = [];
    for (let i = 0; i < invoices.length; i += 2) {
      pairs.push(invoices.slice(i, i + 2));
    }
    let currentSheet: typeof invoices = [];
    let currentSheetWeight = 0;
    for (const pair of pairs) {
      const maxItemsInRow = Math.max(
        ...pair.map((inv) => Math.max(1, inv.items.length)),
      );
      const rowWeight = maxItemsInRow >= 6 ? 2 : 1;
      if (currentSheet.length > 0 && currentSheetWeight + rowWeight > 2) {
        chunked4Up.push(currentSheet);
        currentSheet = [...pair];
        currentSheetWeight = rowWeight;
      } else {
        currentSheet.push(...pair);
        currentSheetWeight += rowWeight;
      }
    }
    if (currentSheet.length > 0) {
      chunked4Up.push(currentSheet);
    }
  }

  const periodTitle = isMonth
    ? `ทั้งเดือน ${formatYearMonthLabel(date)}`
    : `วันที่ ${formatDateLong(date)}`;

  return (
    <>
      <style media="print">{pagePrintCss}</style>
      <Card className="no-print mb-5 w-full gap-0 overflow-hidden border-border bg-white p-0 shadow-md min-[768px]:sticky min-[768px]:top-[61px] min-[768px]:z-30 min-[1100px]:top-0">
        {/* ส่วนหัว: ปุ่มกลับ + ชื่อหน้า/สรุปจำนวน | ปุ่มพิมพ์ */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label="กลับหน้าบิล"
            >
              <Link href={`/bills?date=${encodeURIComponent(date)}`}>
                <IconArrowLeft size={16} />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base leading-tight font-bold text-foreground">
                พิมพ์ใบกำกับภาษีรวม · {periodTitle}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {batchCount > 1 ? (
                  <>
                    ชุดที่ <strong className="text-foreground">{currentBatch}/{batchCount}</strong> · ใบที่{" "}
                    {(batchStartIdx + 1).toLocaleString("th-TH")}–{batchEndIdx.toLocaleString("th-TH")} จาก{" "}
                    {totalFilteredCount.toLocaleString("th-TH")} ใบ
                  </>
                ) : (
                  <>
                    เตรียมพิมพ์{" "}
                    <strong className="text-foreground">
                      {invoices.length.toLocaleString("th-TH")} ใบ
                    </strong>
                  </>
                )}
              </p>
            </div>
          </div>
          <PrintButton className="w-full shrink-0 sm:w-auto" />
        </div>

        {/* ตัวกรองข้อมูล + ตั้งค่าการพิมพ์ (ป้ายกำกับคอลัมน์เดียวกัน จัดแนวตรงกัน) */}
        <div className="grid gap-3 px-3.5 py-3 sm:px-5 min-[1440px]:grid-cols-2 min-[1440px]:gap-x-8">
          <div className="flex min-w-0 flex-col gap-3">
            <FieldRow label="รอบบิล">
              <DatePickerField
                name="date"
                defaultValue={date}
                availableDates={availableDates}
                routePattern="/days/[date]/invoices"
                allowClear={false}
                className="w-full sm:w-auto"
                extraParams={{
                  mode: mode === "full" ? "full" : undefined,
                  paper:
                    (mode === "abbreviated" &&
                      paper !== (settings.defaultPaperSize ?? "a6")) ||
                      (mode === "full" && paper !== "a4")
                      ? paper
                      : undefined,
                  channel: channelFilter !== "all" ? channelFilter : undefined,
                  link: effectiveLinkFilter !== "linked" ? effectiveLinkFilter : undefined,
                }}
              />
            </FieldRow>
            <FieldRow label="ช่องทาง">
              <div
                role="group"
                aria-label="กรองช่องทางพิมพ์ใบกำกับภาษี"
                className={`${SEGMENT_GROUP} grid grid-cols-2 sm:inline-flex`}
              >
                {[
                  { key: "all" as const, label: "ทุกช่องทาง", count: billableTotalCount },
                  { key: "TikTok" as const, label: "TikTok", count: tiktokOrdersCount },
                  { key: "Shopee" as const, label: "Shopee", count: shopeeOrdersCount },
                  { key: "Facebook" as const, label: "Facebook", count: facebookOrdersCount },
                ].map((ch) => {
                  const active = channelFilter === ch.key;
                  const brand =
                    active && ch.key === "Shopee"
                      ? " bg-[#ee4d2d] text-white hover:bg-[#d73211]"
                      : active && ch.key === "Facebook"
                        ? " bg-[#1877F2] text-white hover:bg-[#166fe5]"
                        : "";
                  return (
                    <Button
                      key={ch.key}
                      asChild
                      variant={active ? "default" : "ghost"}
                      size="xs"
                      className={(active ? SEGMENT_ON : SEGMENT_OFF) + brand}
                    >
                      <Link href={buildPrintHref({ nextChannel: ch.key })} scroll={false}>
                        {ch.label}
                        <span className={active ? "opacity-80" : "text-muted-foreground"}>
                          {ch.count.toLocaleString("th-TH")}
                        </span>
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </FieldRow>
            {unlinkedOrdersCount > 0 ? (
              <FieldRow label="คัดกรองบิล">
                <div
                  role="group"
                  aria-label="คัดกรองสถานะการผูกไฟล์"
                  className={`${SEGMENT_GROUP} grid grid-cols-2 sm:inline-flex`}
                >
                  {[
                    { key: "linked" as const, label: "ข้อมูลครบ", count: linkedOrdersCount, dot: "bg-[#059669]" },
                    { key: "all" as const, label: "ทั้งหมด", count: channelFilteredCount, dot: "" },
                    { key: "unlinked" as const, label: "รอไฟล์ ออเดอร์ใน shipnity", count: unlinkedOrdersCount, dot: "bg-[#d97706]" },
                  ].map((opt) => {
                    const active = effectiveLinkFilter === opt.key;
                    return (
                      <Button
                        key={opt.key}
                        asChild
                        variant={active ? "default" : "ghost"}
                        size="xs"
                        className={`${active ? SEGMENT_ON : SEGMENT_OFF}${opt.key === "unlinked" ? " col-span-2 sm:col-span-1" : ""}`}
                      >
                        <Link href={buildPrintHref({ nextLink: opt.key })} scroll={false}>
                          {opt.dot ? (
                            <span className={`size-2 shrink-0 rounded-full ${active ? "bg-white" : opt.dot}`} />
                          ) : null}
                          {opt.label}
                          <span className={active ? "opacity-80" : "text-muted-foreground"}>
                            {opt.count.toLocaleString("th-TH")}
                          </span>
                        </Link>
                      </Button>
                    );
                  })}
                </div>
              </FieldRow>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-3 border-t border-border/70 pt-3 min-[1440px]:border-t-0 min-[1440px]:border-l min-[1440px]:pt-0 min-[1440px]:pl-8">
            {enableFullTaxInvoice ? (
              <FieldRow label="รูปแบบเอกสาร">
                <div
                  role="group"
                  aria-label="รูปแบบใบกำกับภาษี"
                  className={`${SEGMENT_GROUP} grid grid-cols-2 sm:inline-flex`}
                >
                  <Button
                    asChild
                    variant={mode === "abbreviated" ? "default" : "ghost"}
                    size="xs"
                    className={mode === "abbreviated" ? SEGMENT_ON : SEGMENT_OFF}
                  >
                    <Link
                      href={buildPrintHref({
                        nextMode: "abbreviated",
                        nextPaper: settings.defaultPaperSize ?? "a6",
                      })}
                      scroll={false}
                    >
                      ใบกำกับฯ อย่างย่อ
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={mode === "full" ? "default" : "ghost"}
                    size="xs"
                    className={mode === "full" ? SEGMENT_ON : SEGMENT_OFF}
                  >
                    <Link href={buildPrintHref({ nextMode: "full", nextPaper: "a4" })} scroll={false}>
                      แบบเต็มรูป (A4)
                    </Link>
                  </Button>
                </div>
              </FieldRow>
            ) : null}
            {mode === "abbreviated" ? (
              <FieldRow label="ขนาดกระดาษ">
                <div
                  role="group"
                  aria-label="ขนาดกระดาษพิมพ์"
                  className={`${SEGMENT_GROUP} grid grid-cols-2 sm:inline-flex`}
                >
                  {[
                    { key: "a6" as InvoicePaperSize, label: "100×150 มม. (A6)" },
                    { key: "a4-4up" as InvoicePaperSize, label: "A4 แบ่ง 4 ใบ" },
                    { key: "80mm" as InvoicePaperSize, label: "สลิป 80 มม." },
                    { key: "a4" as InvoicePaperSize, label: "A4 เต็มแผ่น" },
                  ].map((opt) => {
                    const active = paper === opt.key;
                    return (
                      <Button
                        key={opt.key}
                        asChild
                        variant={active ? "default" : "ghost"}
                        size="xs"
                        className={active ? SEGMENT_ON : SEGMENT_OFF}
                      >
                        <Link href={buildPrintHref({ nextPaper: opt.key })} scroll={false}>
                          {opt.label}
                        </Link>
                      </Button>
                    );
                  })}
                </div>
              </FieldRow>
            ) : null}
            {mode === "abbreviated" &&
              (paper === "a6" || paper === "a4-4up" || paper === "80mm") ? (
              <div className="hidden sm:block sm:pl-[116px]">
                <InvoiceZoomControl compact />
              </div>
            ) : null}
          </div>
        </div>

        {/* แบ่งชุดพิมพ์ (Batch Print Pagination) เมื่อมีใบกำกับภาษีมากกว่า 100 ใบ ป้องกันเบราว์เซอร์ค้างเมื่อพิมพ์ทั้งเดือน */}
        {totalFilteredCount > 100 ? (
          <div className="flex flex-col gap-2.5 border-t border-border/80 bg-[#f8fafc] px-3.5 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">
                แบ่งชุดพิมพ์{" "}
                <span className="font-normal text-muted-foreground">
                  · {totalFilteredCount.toLocaleString("th-TH")} ใบ / {batchCount} ชุด
                </span>
              </span>
              <div
                role="group"
                aria-label="จำนวนใบกำกับภาษีต่อชุดพิมพ์"
                className={`${SEGMENT_GROUP} grid grid-cols-3 sm:inline-flex`}
              >
                {([100, 200, 500] as const).map((sz) => {
                  const active = batchSize === sz;
                  return (
                    <Button
                      key={sz}
                      asChild
                      variant={active ? "default" : "ghost"}
                      size="xs"
                      className={active ? SEGMENT_ON : SEGMENT_OFF}
                    >
                      <Link
                        href={buildPrintHref({ nextBatchSize: sz, nextBatch: 1 })}
                        scroll={false}
                      >
                        {sz} ใบ/ชุด
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </div>
            <BatchPicker
              currentBatch={currentBatch}
              items={(() => {
                const visibleBatches: number[] = [];
                if (batchCount <= 12) {
                  for (let i = 1; i <= batchCount; i++) visibleBatches.push(i);
                } else {
                  const startB = Math.max(1, Math.min(currentBatch - 4, batchCount - 9));
                  const endB = Math.min(batchCount, startB + 9);
                  if (startB > 1) visibleBatches.push(1);
                  for (let i = startB; i <= endB; i++) visibleBatches.push(i);
                  if (endB < batchCount) visibleBatches.push(batchCount);
                }
                return visibleBatches.map((bNum) => {
                  const sIdx = (bNum - 1) * batchSize + 1;
                  const eIdx = Math.min(totalFilteredCount, bNum * batchSize);
                  return {
                    batch: bNum,
                    href: buildPrintHref({ nextBatch: bNum }),
                    rangeLabel: `${sIdx.toLocaleString("th-TH")}–${eIdx.toLocaleString("th-TH")}`,
                  };
                });
              })()}
            />
          </div>
        ) : null}

        {/* แถบแจ้งเตือนบางๆ บรรทัดเดียวเมื่อมีบิลขาดไฟล์ OMS */}
        {unlinkedOrdersCount > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[#fde68a] bg-[#fffbeb] px-4 py-2 text-center text-xs text-[#92400e] text-balance">
            <div className="flex items-center justify-center gap-2">
              <IconAlert size={14} className="shrink-0 text-[#d97706]" />
              <span>
                คัดเฉพาะบิลที่ผูกข้อมูลครบ{" "}
                <strong>{linkedOrdersCount.toLocaleString("th-TH")} ใบ</strong>{" "}
                ขึ้นมาให้พิมพ์อัตโนมัติ (มีอีก{" "}
                <strong>{unlinkedOrdersCount.toLocaleString("th-TH")} ใบ</strong>{" "}
                ยังรอไฟล์ ออเดอร์ใน shipnity
                {missingOmsDates.length > 0
                  ? ` · วันสั่งซื้อ ${missingOmsDates.map((d) => formatDate(d)).join(", ")}`
                  : ""}
                )
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      {mode === "abbreviated" && paper === "a4-4up" ? (
        <div className="space-y-6 print:space-y-0">
          {chunked4Up.map((sheetInvoices, sheetIdx) => (
            <div
              key={`sheet-${sheetIdx}`}
              className="invoice-4up-sheet mx-auto print:max-w-none print:grid print:grid-cols-2 print:gap-2 print:break-after-page last:print:break-after-auto"
            >
              {sheetInvoices.map((invoice) => (
                <InvoiceDocument
                  key={invoice.orderId}
                  invoice={invoice}
                  mode={mode}
                  paperSize="a4-4up"
                  compact
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="invoice-stack">
          {invoices.map((invoice) => (
            <InvoiceDocument
              key={invoice.orderId}
              invoice={invoice}
              mode={mode}
              paperSize={paper}
              compact
            />
          ))}
        </div>
      )}
    </>
  );
}
