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
import { Button } from "@/components/ui/button";
import { buildInvoice } from "@/lib/invoice";
import { getBill } from "@/lib/queries";

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
  const mode: InvoiceMode =
    resolvedSearchParams.mode === "full" ? "full" : "abbreviated";

  const row = await getBill(decodeURIComponent(orderId));
  if (!row) notFound();
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
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm" className="h-9">
                  <Link href={`/bills/${row.externalId}`}>
                    <IconArrowLeft size={16} /> กลับไปบิล
                  </Link>
                </Button>
                {row.paidDate ? (
                  <>
                    <Button asChild variant="outline" size="sm" className="h-9">
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
                      <Button asChild variant="outline" size="sm" className="h-9">
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

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1">
                  <Button
                    asChild
                    variant={mode === "abbreviated" ? "default" : "ghost"}
                    size="xs"
                    className={
                      mode === "abbreviated"
                        ? "shadow-xs"
                        : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
                    }
                  >
                    <Link href={buildHref("abbreviated", "a6")}>
                      ใบกำกับฯ (อย่างย่อ)
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={mode === "full" ? "default" : "ghost"}
                    size="xs"
                    className={
                      mode === "full"
                        ? "shadow-xs"
                        : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
                    }
                  >
                    <Link href={buildHref("full", "a4")}>
                      ใบกำกับฯ (แบบเต็มรูป)
                    </Link>
                  </Button>
                </div>
                <PrintButton />
              </div>
            </div>

            {mode === "abbreviated" ? (
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#f8fafc] px-4 py-2 sm:px-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-[#334155]">
                    ขนาดกระดาษพิมพ์:
                  </span>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-2xs">
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
                              ? "shadow-xs"
                              : "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                          }
                        >
                          <Link href={buildHref("abbreviated", opt.key)}>
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
