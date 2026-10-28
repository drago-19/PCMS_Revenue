import Link from "next/link";
import { notFound } from "next/navigation";
import { DatePickerField } from "@/components/DatePickerField";
import {
  InvoiceDocument,
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { InvoiceZoomControl } from "@/components/InvoiceZoomControl";
import { PrintButton } from "@/components/PrintButton";
import { IconAlert, IconArrowLeft } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateLong } from "@/lib/format";
import { buildInvoice } from "@/lib/invoice";
import {
  getDailyBatch,
  getOrderLinkStatus,
  listDailyBatches,
} from "@/lib/queries";
import { getDocumentSettings } from "@/lib/settings";

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
  }>;
}) {
  const { date } = await params;
  const resolvedSearchParams = await searchParams;
  const mode: InvoiceMode =
    resolvedSearchParams.mode === "full" ? "full" : "abbreviated";
  const rawLink = (resolvedSearchParams.link ?? "linked").trim();

  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isMonth = /^\d{4}-\d{2}$/.test(date);
  if (!isDay && !isMonth) notFound();

  const [batch, allBatches, settings] = await Promise.all([
    getDailyBatch(date),
    listDailyBatches(400),
    getDocumentSettings(),
  ]);
  if (!batch || batch.orders.length === 0) notFound();

  const paper = parsePaperSize(
    resolvedSearchParams.paper,
    mode,
    settings.defaultPaperSize ?? "a6",
  );

  const availableDates = allBatches.map((b) => ({
    date: b.date,
    count: b.orderCount,
  }));

  const channelFilteredOrders = batch.orders;

  const linkedOrders = channelFilteredOrders.filter(
    (o) => getOrderLinkStatus(o) === "linked",
  );
  const unlinkedOrders = channelFilteredOrders.filter(
    (o) => getOrderLinkStatus(o) !== "linked",
  );

  // ค่าเริ่มต้นคือพิมพ์เฉพาะบิลที่ผูกครบแล้ว (แต่ถ้าในรอบนั้นยังไม่มีบิลผูกครบเลย ให้แสดงทั้งหมดพร้อมคำเตือน)
  const effectiveLinkFilter: "linked" | "all" | "unlinked" =
    rawLink === "all"
      ? "all"
      : rawLink === "unlinked"
        ? "unlinked"
        : linkedOrders.length > 0
          ? "linked"
          : "all";

  const finalOrders =
    effectiveLinkFilter === "linked"
      ? linkedOrders
      : effectiveLinkFilter === "unlinked"
        ? unlinkedOrders
        : channelFilteredOrders;

  const missingOmsDates = [
    ...new Set(
      unlinkedOrders
        .map((o) => o.createdDate)
        .filter((d): d is string => Boolean(d && d !== "unknown")),
    ),
  ].slice(0, 4);

  const invoices = finalOrders.map((order) => buildInvoice(order, settings));

  function buildPrintHref(overrides: {
    nextDate?: string;
    nextMode?: InvoiceMode;
    nextPaper?: InvoicePaperSize;
    nextLink?: "linked" | "all" | "unlinked";
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
    const targetLink = overrides.nextLink ?? effectiveLinkFilter;
    if (targetLink !== "linked") {
      search.set("link", targetLink);
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
      <Card className="no-print sticky top-14 z-30 mb-5 w-full gap-0 overflow-hidden border-border bg-white/95 p-0 shadow-md backdrop-blur-md min-[1100px]:top-2">
        {/* แถวที่ 1: กระจายเต็มความกว้าง (ซ้าย: ปุ่มกลับ | กลาง: เลือกรอบบิล + จำนวนใบ | ขวา: รูปแบบเอกสาร + ปุ่มพิมพ์) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="xs" className="h-9 px-3">
              <Link
                href={
                  isDay
                    ? `/days/${date}`
                    : `/bills?date=${encodeURIComponent(date)}`
                }
              >
                <IconArrowLeft size={15} />{" "}
                {isDay ? "กลับหน้ารอบชำระ" : "กลับหน้าบิล"}
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold whitespace-nowrap text-foreground">
              รอบบิล:
            </span>
            <DatePickerField
              name="date"
              defaultValue={date}
              availableDates={availableDates}
              routePattern="/days/[date]/invoices"
              allowClear={false}
              extraParams={{
                mode: mode === "full" ? "full" : undefined,
                paper:
                  (mode === "abbreviated" &&
                    paper !== (settings.defaultPaperSize ?? "a6")) ||
                    (mode === "full" && paper !== "a4")
                    ? paper
                    : undefined,
                link: effectiveLinkFilter !== "linked" ? effectiveLinkFilter : undefined,
              }}
            />
            <Badge variant="default" size="sm" className="h-7 px-2.5 font-bold">
              เตรียมพิมพ์ {invoices.length.toLocaleString("th-TH")} ใบ
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="รูปแบบใบกำกับภาษี"
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1"
            >
              <Button
                asChild
                variant={mode === "abbreviated" ? "default" : "ghost"}
                size="xs"
                className={
                  mode === "abbreviated"
                    ? "h-8 min-h-[32px] shadow-xs"
                    : "h-8 min-h-[32px] text-[#334155] hover:bg-white hover:text-[#0f172a]"
                }
              >
                <Link
                  href={buildPrintHref({
                    nextMode: "abbreviated",
                    nextPaper: settings.defaultPaperSize ?? "a6",
                  })}
                >
                  ใบกำกับฯ อย่างย่อ
                </Link>
              </Button>
              <Button
                asChild
                variant={mode === "full" ? "default" : "ghost"}
                size="xs"
                className={
                  mode === "full"
                    ? "h-8 min-h-[32px] shadow-xs"
                    : "h-8 min-h-[32px] text-[#334155] hover:bg-white hover:text-[#0f172a]"
                }
              >
                <Link
                  href={buildPrintHref({ nextMode: "full", nextPaper: "a4" })}
                >
                  แบบเต็มรูป (A4)
                </Link>
              </Button>
            </div>
            <PrintButton />
          </div>
        </div>

        {/* แถวที่ 2: กระจายเต็มความกว้างในบรรทัดเดียว (ซ้าย: คัดกรองสถานะ | ขวา: ขนาดกระดาษพิมพ์) */}
        {unlinkedOrders.length > 0 || mode === "abbreviated" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8fafc] px-4 py-2 sm:px-5">
            {unlinkedOrders.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold whitespace-nowrap text-foreground">
                  คัดกรองบิล:
                </span>
                <div
                  role="group"
                  aria-label="คัดกรองสถานะการผูกไฟล์"
                  className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1"
                >
                  <Button
                    asChild
                    variant={effectiveLinkFilter === "linked" ? "default" : "ghost"}
                    size="xs"
                    className={
                      effectiveLinkFilter === "linked"
                        ? "h-8 min-h-[32px] px-2.5 shadow-2xs"
                        : "h-8 min-h-[32px] px-2.5 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                    }
                  >
                    <Link href={buildPrintHref({ nextLink: "linked" })}>
                      <span
                        className={`size-2 rounded-full ${effectiveLinkFilter === "linked"
                            ? "bg-white"
                            : "bg-[#059669]"
                          }`}
                      />
                      ข้อมูลครบ ({linkedOrders.length.toLocaleString("th-TH")})
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={effectiveLinkFilter === "all" ? "default" : "ghost"}
                    size="xs"
                    className={
                      effectiveLinkFilter === "all"
                        ? "h-8 min-h-[32px] px-2.5 shadow-2xs"
                        : "h-8 min-h-[32px] px-2.5 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                    }
                  >
                    <Link href={buildPrintHref({ nextLink: "all" })}>
                      ทั้งหมด ({channelFilteredOrders.length.toLocaleString("th-TH")})
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={effectiveLinkFilter === "unlinked" ? "default" : "ghost"}
                    size="xs"
                    className={
                      effectiveLinkFilter === "unlinked"
                        ? "h-8 min-h-[32px] px-2.5 shadow-2xs"
                        : "h-8 min-h-[32px] px-2.5 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                    }
                  >
                    <Link href={buildPrintHref({ nextLink: "unlinked" })}>
                      <span
                        className={`size-2 rounded-full ${effectiveLinkFilter === "unlinked"
                            ? "bg-white"
                            : "bg-[#d97706]"
                          }`}
                      />
                      รอไฟล์ ออเดอร์ใน shipnity ({unlinkedOrders.length.toLocaleString("th-TH")})
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div />
            )}

            {mode === "abbreviated" ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold whitespace-nowrap text-foreground">
                    ขนาดกระดาษ:
                  </span>
                  <div
                    role="group"
                    aria-label="ขนาดกระดาษพิมพ์"
                    className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1"
                  >
                    {[
                      {
                        key: "a6" as InvoicePaperSize,
                        label: "100×150 มม. (A6)",
                      },
                      {
                        key: "a4-4up" as InvoicePaperSize,
                        label: "A4 แบ่ง 4 ใบ",
                      },
                      {
                        key: "80mm" as InvoicePaperSize,
                        label: "สลิป 80 มม.",
                      },
                      {
                        key: "a4" as InvoicePaperSize,
                        label: "A4 เต็มแผ่น",
                      },
                    ].map((opt) => {
                      const active = paper === opt.key;
                      return (
                        <Button
                          key={opt.key}
                          asChild
                          variant={active ? "default" : "ghost"}
                          size="xs"
                          className={
                            active
                              ? "h-8 min-h-[32px] px-2.5 shadow-2xs"
                              : "h-8 min-h-[32px] px-2.5 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                          }
                        >
                          <Link href={buildPrintHref({ nextPaper: opt.key })}>
                            {opt.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                {paper === "a6" || paper === "a4-4up" || paper === "80mm" ? (
                  <InvoiceZoomControl compact />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* แถบแจ้งเตือนบางๆ บรรทัดเดียวเมื่อมีบิลขาดไฟล์ OMS */}
        {unlinkedOrders.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#fde68a] bg-[#fffbeb] px-4 py-2 text-xs text-[#92400e]">
            <div className="flex items-center gap-2">
              <IconAlert size={14} className="shrink-0 text-[#d97706]" />
              <span>
                คัดเฉพาะบิลที่ผูกข้อมูลครบ{" "}
                <strong>{linkedOrders.length.toLocaleString("th-TH")} ใบ</strong>{" "}
                ขึ้นมาให้พิมพ์อัตโนมัติ (มีอีก{" "}
                <strong>{unlinkedOrders.length.toLocaleString("th-TH")} ใบ</strong>{" "}
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
