import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildInvoice } from "@/lib/invoice";
import { getDailyBatch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "พิมพ์ใบกำกับภาษีทั้งรอบ" };

export default async function BulkInvoicesPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
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
        <div className="invoice-toolbar-actions">
          <span className="muted small">
            {invoices.length} ใบ · พิมพ์ออกทั้งหมดเพื่อแยกเป็นชุด
          </span>
          <PrintButton />
        </div>
      </div>
      <div className="invoice-stack">
        {invoices.map((invoice) => (
          <InvoiceDocument key={invoice.orderId} invoice={invoice} compact />
        ))}
      </div>
    </>
  );
}
