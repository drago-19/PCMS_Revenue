import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument, type InvoiceMode } from "@/components/InvoiceDocument";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildInvoice } from "@/lib/invoice";
import { getDailyBatch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "พิมพ์ใบกำกับภาษีทั้งรอบ" };

export default async function BulkInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { date } = await params;
  const resolvedSearchParams = await searchParams;
  const mode: InvoiceMode =
    resolvedSearchParams.mode === "full" ? "full" : "abbreviated";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const batch = await getDailyBatch(date);
  if (!batch || batch.orders.length === 0) notFound();

  const invoices = batch.orders.map(buildInvoice);

  return (
    <>
      <div className="invoice-toolbar no-print">
        <Button asChild variant="ghost" className="back-link px-2">
          <Link href={`/days/${date}`}>
            <IconArrowLeft size={17} /> กลับไปรอบชำระ
          </Link>
        </Button>
        <div className="invoice-toolbar-actions flex flex-wrap items-center gap-2">
          <span className="muted small">
            {invoices.length} ใบ · พิมพ์ออกทั้งหมดเพื่อแยกเป็นชุด
          </span>
          <div className="inline-flex items-center gap-1 rounded-xl border border-[#cbd5e1] bg-[#e2e8f0] p-1">
            <Button
              asChild
              variant={mode === "abbreviated" ? "default" : "ghost"}
              size="xs"
            >
              <Link href={`/days/${date}/invoices`}>อย่างย่อ</Link>
            </Button>
            <Button
              asChild
              variant={mode === "full" ? "default" : "ghost"}
              size="xs"
            >
              <Link href={`/days/${date}/invoices?mode=full`}>แบบเต็มรูป</Link>
            </Button>
          </div>
          <PrintButton />
        </div>
      </div>
      <div className="invoice-stack">
        {invoices.map((invoice) => (
          <InvoiceDocument
            key={invoice.orderId}
            invoice={invoice}
            mode={mode}
            compact
          />
        ))}
      </div>
    </>
  );
}
