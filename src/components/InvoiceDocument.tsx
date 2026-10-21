import type { InvoiceModel } from "@/lib/invoice";
import { formatDate, formatDateTime, formatTHB } from "@/lib/format";

export function InvoiceDocument({
  invoice,
  compact = false,
}: {
  invoice: InvoiceModel;
  compact?: boolean;
}) {
  const lines = [
    invoice.seller.name,
    ...invoice.seller.address.split("\n"),
  ].filter(Boolean);

  return (
    <article className={`invoice${compact ? " invoice-compact" : ""}`}>
      <header className="invoice-head">
        <div className="invoice-seller">
          <h2>{invoice.seller.name}</h2>
          {lines.slice(1).map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            เลขประจำตัวผู้เสียภาษีอากร{" "}
            <strong>{invoice.seller.taxId}</strong>
          </p>
        </div>
        <div className="invoice-title-block">
          <h1>ใบเสร็จรับเงิน / ใบกำกับภาษี</h1>
          <p className="invoice-title-sub">(อย่างย่อ)</p>
        </div>
      </header>

      <div className="invoice-refs">
        <div>
          <span className="invoice-label">เลขที่</span>
          <span className="mono">{invoice.invoiceNo ?? "-"}</span>
        </div>
        <div>
          <span className="invoice-label">เลขที่ออเดอร์</span>
          <span className="mono">{invoice.orderId}</span>
        </div>
        <div>
          <span className="invoice-label">วันที่</span>
          <span>{formatDateTime(invoice.issuedAt)}</span>
        </div>
      </div>

      <div className="invoice-channel">
        <div>
          <span className="invoice-label">ช่องทาง</span>
          <span>TikTok Shop</span>
        </div>
        <div>
          <span className="invoice-label">เลขที่บน Marketplace</span>
          <span className="mono">{invoice.orderId}</span>
        </div>
        <div>
          <span className="invoice-label">อัตราภาษี</span>
          <span>ร้อยละ {invoice.seller.vatRate}</span>
        </div>
      </div>

      <table className="invoice-table">
        <thead>
          <tr>
            <th style={{ width: "70%" }}>รายการ</th>
            <th style={{ width: "30%" }} className="num">
              จำนวนเงิน
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.length === 0 ? (
            <tr>
              <td>สินค้าตามคำสั่งซื้อ</td>
              <td className="num">{formatTHB(invoice.salesAmount)}</td>
            </tr>
          ) : (
            invoice.items.map((item, index) => (
              <tr key={`${item.sku}-${index}`}>
                <td>
                  SKU {item.sku} × {item.qty}
                </td>
                <td className="num">{index === 0 ? formatTHB(invoice.salesAmount) : ""}</td>
              </tr>
            ))
          )}
          <tr>
            <td>ค่าส่ง</td>
            <td className="num">{formatTHB(invoice.shippingFee)}</td>
          </tr>
          <tr className="invoice-total-row">
            <td>ราคารวมภาษีมูลค่าเพิ่ม (รวมทั้งสิ้น)</td>
            <td className="num">{formatTHB(invoice.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="invoice-baht-text">
        <span>จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</span>
        <span className="invoice-baht-value">- {invoice.totalText} -</span>
      </div>

      <footer className="invoice-thanks">
        <p>ขอบคุณที่อุดหนุนค่ะ</p>
      </footer>
    </article>
  );
}
