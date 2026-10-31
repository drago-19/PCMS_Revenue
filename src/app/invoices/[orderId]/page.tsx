import Link from "next/link";
import { notFound } from "next/navigation";
import {
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { InvoiceInteractiveView } from "@/components/InvoiceInteractiveView";
import { InvoiceZoomControl } from "@/components/InvoiceZoomControl";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft, IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildInvoice, isOrderEligibleForInvoice } from "@/lib/invoice";
import { getBill } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "ใบกำกับภาษี" };

function parsePaperSize(
  raw: string | undefined,
  mode: InvoiceMode,
  defaultPaper: InvoicePaperSize = "a6",
): InvoicePaperSize {
  if (raw === "a6" || raw === "a4-4up" || raw === "80mm" || raw === "a4") {
    return raw;
  }
  return mode === "full" ? "a4" : defaultPaper;
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ mode?: string; paper?: string }>;
}) {
  const { orderId } = await params;
  const resolvedSearchParams = await searchParams;

  const row = await getBill(decodeURIComponent(orderId));
  if (!row) notFound();

  if (!isOrderEligibleForInvoice(row)) {
    const isNoPrice = row.isNoProductPriceOrder === true;
    const isNegativeOrZero = row.income <= 0 || row.payout <= 0;
    const isMissingOms = !row.orderCode || row.orderCode.trim() === "";
    const isTiktokOmsPlaceholder =
      row.channel === "TikTok" && row.transactionType === "คำสั่งซื้อ (OMS)";

    const title = isNoPrice
      ? "ไม่ออกใบกำกับภาษี (บิลเปลี่ยนสินค้า)"
      : isNegativeOrZero
        ? "ไม่ออกใบกำกับภาษี (คืนเงิน / ตีกลับ / ขาดทุน)"
        : isTiktokOmsPlaceholder
          ? "ไม่ออกใบกำกับภาษี (รอไฟล์ Settlement จาก TikTok)"
          : isMissingOms
            ? "ไม่ออกใบกำกับภาษี (ยังไม่ผูกออเดอร์ Shipnity)"
            : "ไม่ออกใบกำกับภาษี (ข้อมูลไม่ครบถ้วน)";

    const reason = isNoPrice
      ? "รายการนี้เป็นออเดอร์เปลี่ยนสินค้า / ไม่มีราคาสินค้า (ยอดขาย ฿0.00) ตามหลักเกณฑ์จะไม่นำมายื่นภาษีขายและไม่ออกใบกำกับภาษี"
      : isNegativeOrZero
        ? "รายการนี้เป็นออเดอร์คืนเงิน ตีกลับ หรือขาดทุน (ยอดขายหรือยอดชำระสุทธิติดลบหรือ ฿0.00) ตามหลักเกณฑ์จะไม่นำมายื่นภาษีขาย เพื่อป้องกันการยื่นภาษีเกินจริง"
        : isTiktokOmsPlaceholder
          ? "รายการนี้เป็นออเดอร์ TikTok ที่ยังไม่มีไฟล์ Settlement รายได้รอบโอนเงินจริง (มีเฉพาะข้อมูลเบื้องต้นจาก Shipnity) กรุณานำเข้าไฟล์ Settlement จาก TikTok เพื่อให้ข้อมูลครบถ้วนก่อนออกใบกำกับภาษี"
          : isMissingOms
            ? "รายการนี้ยังไม่ได้ผูกกับเลขออเดอร์ใน Shipnity กรุณาผูกข้อมูลหรือนำเข้าไฟล์ให้เรียบร้อยก่อนออกใบกำกับภาษี"
            : "รายการนี้มีข้อมูลสินค้าหรือรายการคำสั่งซื้อไม่ครบถ้วน จึงไม่อนุญาตให้ออกหรือพิมพ์ใบกำกับภาษี";

    return (
      <div className="flex min-h-[75dvh] w-full items-center justify-center p-4">
        <Card className="w-full max-w-[600px] border-amber-200 bg-white shadow-md">
          <CardHeader className="space-y-2 border-b border-amber-100 bg-amber-50/60 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                variant={
                  row.channel === "Shopee"
                    ? "shopee"
                    : row.channel === "Facebook"
                      ? "facebook"
                      : "default"
                }
                size="sm"
              >
                {row.channel || "TikTok"}
              </Badge>
              {row.orderCode ? (
                <span className="mono text-xs font-semibold text-slate-600">
                  #{row.orderCode}
                </span>
              ) : null}
            </div>
            <CardTitle className="text-lg font-bold text-amber-950 sm:text-xl">
              {title}
            </CardTitle>
            <CardDescription className="text-xs text-amber-900/80 sm:text-sm">
              ระบบอนุญาตให้ออกและพิมพ์ใบกำกับภาษีเฉพาะบิลขายปกติที่มีข้อมูลครบถ้วนเท่านั้น
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                เหตุผลที่ไม่ออกใบกำกับภาษี
              </div>
              <p className="text-sm font-medium leading-relaxed text-slate-800">
                {reason}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="text-slate-500 block text-xs">เลขคำสั่งซื้อ:</span>
                <span className="mono font-semibold text-slate-800 break-all">
                  {row.externalId}
                </span>
              </div>
              <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="text-slate-500 block text-xs">
                  ยอดชำระสุทธิ (Payout):
                </span>
                <span
                  className={cn(
                    "mono font-bold text-sm",
                    row.payout <= 0 ? "text-rose-600" : "text-emerald-700",
                  )}
                >
                  {row.payout < 0
                    ? `-฿${Math.abs(row.payout).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}`
                    : `฿${row.payout.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}`}
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 pt-3">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href="/bills">ดูรายการบิลทั้งหมด</Link>
            </Button>
            <Button asChild variant="default" size="sm" className="w-full sm:w-auto">
              <Link href={`/bills/${encodeURIComponent(row.externalId)}`}>
                <IconArrowLeft size={16} className="mr-1.5" /> ดูรายละเอียดบิลคำสั่งซื้อ
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const enableFullTaxInvoice =
    row.sellerSettings?.enableFullTaxInvoice === true;
  const mode: InvoiceMode =
    enableFullTaxInvoice && resolvedSearchParams.mode === "full"
      ? "full"
      : "abbreviated";
  const defaultAbbrevPaper: InvoicePaperSize =
    row.sellerSettings?.defaultPaperSize ?? "a6";
  const paper = parsePaperSize(
    resolvedSearchParams.paper,
    mode,
    defaultAbbrevPaper,
  );
  const invoice = buildInvoice(row);

  function buildHref(nextMode: InvoiceMode, nextPaper?: InvoicePaperSize) {
    const sp = new URLSearchParams();
    if (nextMode === "full") sp.set("mode", "full");
    const targetPaper = nextPaper ?? (nextMode === "full" ? "a4" : paper);
    if (
      (nextMode === "abbreviated" && targetPaper !== defaultAbbrevPaper) ||
      (nextMode === "full" && targetPaper !== "a4")
    ) {
      sp.set("paper", targetPaper);
    }
    const qs = sp.toString();
    const base = `/invoices/${encodeURIComponent(row!.externalId)}`;
    return qs ? `${base}?${qs}` : base;
  }

  const pagePrintCss =
    paper === "a6"
      ? "@page { size: A6 portrait; margin: 3.5mm; }"
      : paper === "80mm"
        ? "@page { size: 80mm auto; margin: 2.5mm; }"
        : "@page { size: A4 portrait; margin: 10mm; }";

  return (
    <>
      <style media="print">{pagePrintCss}</style>
      <InvoiceInteractiveView
        invoice={invoice}
        mode={mode}
        paperSize={paper}
        toolbarTop={
          <>
            <div className="flex flex-col gap-2.5 border-b border-border px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Button asChild variant="outline" size="sm" className="h-9 flex-1 sm:flex-initial">
                  <Link href={`/bills/${row.externalId}`}>
                    <IconArrowLeft size={16} /> กลับไปบิล
                  </Link>
                </Button>
                {row.paidDate ? (
                  <>
                    <Button asChild variant="outline" size="sm" className="h-9 flex-1 sm:flex-initial">
                      <Link
                        href={
                          mode === "full"
                            ? `/days/${row.paidDate}/invoices?mode=full`
                            : `/days/${row.paidDate}/invoices?paper=${paper}`
                        }
                      >
                        <IconReceipt size={15} /> พิมพ์รวมทั้งวัน
                      </Link>
                    </Button>
                    {/^\d{4}-\d{2}/.test(row.paidDate) ? (
                      <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
                        <Link
                          href={
                            mode === "full"
                              ? `/days/${row.paidDate.slice(0, 7)}/invoices?mode=full`
                              : `/days/${row.paidDate.slice(0, 7)}/invoices?paper=${paper}`
                          }
                        >
                          <IconReceipt size={15} /> พิมพ์รวมทั้งเดือน
                        </Link>
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                {enableFullTaxInvoice ? (
                  <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1 sm:inline-flex sm:w-auto sm:items-center">
                    <Button
                      asChild
                      variant={mode === "abbreviated" ? "default" : "ghost"}
                      size="xs"
                      className={
                        mode === "abbreviated"
                          ? "w-full shadow-xs sm:w-auto"
                          : "w-full text-[#334155] hover:bg-white hover:text-[#0f172a] sm:w-auto"
                      }
                    >
                      <Link href={buildHref("abbreviated", "a6")} scroll={false}>
                        ใบกำกับฯ (อย่างย่อ)
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant={mode === "full" ? "default" : "ghost"}
                      size="xs"
                      className={
                        mode === "full"
                          ? "w-full shadow-xs sm:w-auto"
                          : "w-full text-[#334155] hover:bg-white hover:text-[#0f172a] sm:w-auto"
                      }
                    >
                      <Link href={buildHref("full", "a4")} scroll={false}>
                        ใบกำกับฯ (แบบเต็มรูป)
                      </Link>
                    </Button>
                  </div>
                ) : null}
                <PrintButton className="w-full sm:w-auto" />
              </div>
            </div>

            {mode === "abbreviated" ? (
              <div className="flex flex-col gap-2 bg-[#f8fafc] px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <span className="text-xs font-bold text-[#334155]">
                    ขนาดกระดาษพิมพ์:
                  </span>
                  <div className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs sm:inline-flex sm:w-auto">
                    {[
                      {
                        key: "a6" as InvoicePaperSize,
                        label: "100×150 มม. (A6)",
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
                              ? "flex-1 justify-center px-2 shadow-xs sm:flex-initial"
                              : "flex-1 justify-center px-2 text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:flex-initial"
                          }
                        >
                          <Link
                            href={buildHref("abbreviated", opt.key)}
                            scroll={false}
                          >
                            {opt.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                {paper === "a6" || paper === "a4-4up" || paper === "80mm" ? (
                  <InvoiceZoomControl />
                ) : null}
              </div>
            ) : null}
          </>
        }
      />
    </>
  );
}
