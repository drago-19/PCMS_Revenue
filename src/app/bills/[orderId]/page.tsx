import Link from "next/link";
import { notFound } from "next/navigation";
import { BillDocument } from "@/components/BillDocument";
import { PrintButton } from "@/components/PrintButton";
import { IconArrowLeft, IconCalendar, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildBill } from "@/lib/bill";
import { getBill, getImport } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "บิลคำสั่งซื้อ" };

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const row = await getBill(decodeURIComponent(orderId));
  if (!row) notFound();

  const importRow = await getImport(row.importId);
  const bill = buildBill(row.normalized);

  return (
    <>
      <style media="print">{"@page { size: A4 portrait; margin: 8mm; }"}</style>
      <div className="bill-toolbar no-print">
        <Button asChild variant="ghost" className="back-link px-2">
          <Link href="/bills">
            <IconArrowLeft size={17} /> กลับไปบิลทั้งหมด
          </Link>
        </Button>
        <div className="bill-toolbar-actions">
          <Button asChild variant="secondary" className="no-print">
            <Link href={`/invoices/${row.externalId}`}>
              <IconReceipt size={16} /> ใบกำกับภาษี
            </Link>
          </Button>
          {row.paidDate ? (
            <Button asChild variant="secondary" className="no-print">
              <Link href={`/days/${row.paidDate}`}>
                <IconCalendar size={16} /> ดูรอบชำระ
              </Link>
            </Button>
          ) : null}
          <PrintButton />
        </div>
      </div>

      <BillDocument
        bill={bill}
        invoiceNo={row.invoiceNo}
        channel={row.channel}
        orderCode={row.orderCode}
        customerName={row.buyerName || row.customerName}
        trackingNo={row.trackingNo}
        courier={row.courier}
        discountCode={row.discountCode}
        discountTotal={row.discountTotal}
        shippingFeeCustomer={row.shippingFeeCustomer}
        shippingFeeSeller={row.shippingFeeSeller}
        marketplaceOrderRaw={row.marketplaceOrderRaw}
        productDetail={row.productDetail}
        omsItems={row.omsItems}
        source={{
          filename: importRow?.filename ?? "ไม่ทราบไฟล์",
          importedAt: importRow?.importedAt ?? row.createdAt,
          importId: row.importId,
        }}
      />

      <p className="bill-page-note no-print">
        บิลนี้สร้างจากข้อมูลในไฟล์ export ของ TikTok Shop โดยยอด “จำนวนเงินที่ชำระทั้งหมด”
        ใช้ค่าจากคอลัมน์ยอดชำระของต้นฉบับ และระบบตรวจสอบว่ายอดรายได้ + ค่าธรรมเนียม +
        รายการปรับปรุง ตรงกับยอดดังกล่าว
      </p>
    </>
  );
}
