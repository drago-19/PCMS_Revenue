import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument, type InvoiceMode } from "@/components/InvoiceDocument";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildInvoice } from "@/lib/invoice";
import { getBill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "ใบกำกับภาษี" };

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { orderId } = await params;
  const resolvedSearchParams = await searchParams;
  const mode: InvoiceMode =
    resolvedSearchParams.mode === "full" ? "full" : "abbreviated";

  const row = await getBill(decodeURIComponent(orderId));
  if (!row) notFound();
  const invoice = buildInvoice(row);

  return (
    <>
      <div className="invoice-toolbar no-print">
        <Button asChild variant="ghost" className="back-link px-2">
          <Link href={`/bills/${row.externalId}`}>
            <IconArrowLeft size={17} /> กลับไปบิล
          </Link>
        </Button>
        <div className="invoice-toolbar-actions flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-[#cbd5e1] bg-[#e2e8f0] p-1">
            <Button
              asChild
              variant={mode === "abbreviated" ? "default" : "ghost"}
              size="xs"
            >
              <Link href={`/invoices/${encodeURIComponent(row.externalId)}`}>
                ใบกำกับฯ (อย่างย่อ)
              </Link>
            </Button>
            <Button
              asChild
              variant={mode === "full" ? "default" : "ghost"}
              size="xs"
            >
              <Link href={`/invoices/${encodeURIComponent(row.externalId)}?mode=full`}>
                ใบกำกับฯ (แบบเต็มรูป)
              </Link>
            </Button>
          </div>
          {row.paidDate ? (
            <Button asChild variant="secondary" className="no-print">
              <Link
                href={
                  mode === "full"
                    ? `/days/${row.paidDate}/invoices?mode=full`
                    : `/days/${row.paidDate}/invoices`
                }
              >
                <IconReceipt size={16} /> พิมพ์ทั้งรอบ
              </Link>
            </Button>
          ) : null}
          <PrintButton />
        </div>
      </div>
      <InvoiceDocument invoice={invoice} mode={mode} />
    </>
  );
}
