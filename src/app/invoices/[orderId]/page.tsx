import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildInvoice } from "@/lib/invoice";
import { getBill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "ใบกำกับภาษี" };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
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
        <div className="invoice-toolbar-actions">
          {row.paidDate ? (
            <Button asChild variant="secondary" className="no-print">
              <Link href={`/days/${row.paidDate}/invoices`}>
                <IconReceipt size={16} /> พิมพ์ทั้งรอบ
              </Link>
            </Button>
          ) : null}
          <PrintButton />
        </div>
      </div>
      <InvoiceDocument invoice={invoice} />
    </>
  );
}
