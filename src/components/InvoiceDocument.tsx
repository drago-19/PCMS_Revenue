import type { InvoiceCustomer, InvoiceModel } from "@/lib/invoice";
import { formatDate, formatDateTime, formatTHB } from "@/lib/format";

export type InvoiceMode = "abbreviated" | "full";

export function InvoiceDocument({
  invoice,
  compact = false,
  mode = "abbreviated",
  buyerOverride,
}: {
  invoice: InvoiceModel;
  compact?: boolean;
  mode?: InvoiceMode;
  buyerOverride?: Partial<InvoiceCustomer>;
}) {
  const lines = [
    invoice.seller.name,
    ...invoice.seller.address.split("\n"),
  ].filter(Boolean);

  const buyer: InvoiceCustomer = {
    ...invoice.customer,
    ...buyerOverride,
  };

  const fullAddressParts = [
    buyer.address,
    buyer.province && (!buyer.address || !buyer.address.includes(buyer.province))
      ? buyer.province
      : null,
    buyer.postalCode &&
    (!buyer.address || !buyer.address.includes(buyer.postalCode))
      ? buyer.postalCode
      : null,
  ].filter(Boolean);
  const fullAddress =
    fullAddressParts.length > 0 ? fullAddressParts.join(" ") : "ลูกค้าทั่วไป";

  const channelLabel =
    invoice.channel === "TikTok"
      ? "TikTok Shop"
      : invoice.channel === "Shopee"
        ? "Shopee"
        : invoice.channel === "Facebook"
          ? "Facebook"
          : invoice.channel;

  const isFull = mode === "full";
  const hasRichItems = invoice.items.some((item) => item.unitPrice !== undefined);

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
          <p className="invoice-title-sub">
            {isFull ? "(แบบเต็มรูป / ต้นฉบับ)" : "(อย่างย่อ)"}
          </p>
        </div>
      </header>

      <div className="invoice-refs">
        <div>
          <span className="invoice-label">เลขที่เอกสาร</span>
          <span className="mono">{invoice.invoiceNo ?? "-"}</span>
        </div>
        <div>
          <span className="invoice-label">เลขคำสั่งซื้อ ({channelLabel})</span>
          <span className="mono">{invoice.orderId}</span>
        </div>
        <div>
          <span className="invoice-label">วันที่ออกเอกสาร</span>
          <span>
            {invoice.paidDate
              ? formatDate(invoice.paidDate)
              : formatDateTime(invoice.issuedAt)}
          </span>
        </div>
      </div>

      <div className="invoice-channel">
        <div>
          <span className="invoice-label">ช่องทางจำหน่าย</span>
          <span>{channelLabel}</span>
        </div>
        <div>
          <span className="invoice-label">เลขที่บน Marketplace</span>
          <span className="mono">{invoice.orderId}</span>
        </div>
        {invoice.trackingNo ? (
          <div>
            <span className="invoice-label">เลขพัสดุ / ขนส่ง</span>
            <span className="mono">
              {invoice.trackingNo}
              {invoice.courier ? ` (${invoice.courier})` : ""}
            </span>
          </div>
        ) : null}
        <div>
          <span className="invoice-label">อัตราภาษี</span>
          <span>ร้อยละ {invoice.seller.vatRate}</span>
        </div>
      </div>

      {isFull || buyer.name ? (
        <div className="mb-3 rounded-lg border border-[#333] bg-[#fafafa] px-3.5 py-2.5 text-[13px] leading-relaxed">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <div>
              <span className="invoice-label block">นามผู้ซื้อ / ลูกค้า</span>
              <strong className="text-[13.5px] text-[#111]">
                {buyer.name || "ลูกค้าทั่วไป (ขายปลีกออนไลน์)"}
              </strong>
              {buyer.phone ? (
                <span className="ml-2 text-xs text-[#444]">
                  โทร. {buyer.phone}
                </span>
              ) : null}
            </div>
            <div>
              <span className="invoice-label block">
                เลขประจำตัวผู้เสียภาษีผู้ซื้อ
              </span>
              <span className="mono text-[13px] font-semibold text-[#111]">
                {buyer.taxId && buyer.taxId.trim() ? buyer.taxId : "-"}
              </span>
            </div>
          </div>
          {(isFull || buyer.address || buyer.province) && (
            <div className="mt-1.5 border-t border-dashed border-[#ccc] pt-1.5">
              <span className="invoice-label block">ที่อยู่ผู้ซื้อ</span>
              <span className="text-[12.5px] text-[#222]">{fullAddress}</span>
            </div>
          )}
        </div>
      ) : null}

      {isFull ? (
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>ลำดับ</th>
              <th style={{ width: "18%" }}>รหัสสินค้า (SKU)</th>
              <th style={{ width: "36%" }}>รายการสินค้า</th>
              <th style={{ width: "10%" }} className="num">
                จำนวน
              </th>
              <th style={{ width: "14%" }} className="num">
                ราคา/หน่วย
              </th>
              <th style={{ width: "14%" }} className="num">
                จำนวนเงิน
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.length === 0 ? (
              <tr>
                <td>1</td>
                <td className="mono">-</td>
                <td>สินค้าตามคำสั่งซื้อ #{invoice.orderCode ?? invoice.orderId}</td>
                <td className="num">1</td>
                <td className="num">{formatTHB(invoice.salesAmount)}</td>
                <td className="num">{formatTHB(invoice.salesAmount)}</td>
              </tr>
            ) : (
              invoice.items.map((item, index) => {
                const unitPrice =
                  item.unitPrice ??
                  (index === 0 ? invoice.salesAmount / Math.max(1, item.qty) : 0);
                const lineTotal =
                  item.lineTotal ??
                  (index === 0 ? invoice.salesAmount : 0);
                return (
                  <tr key={`${item.sku}-${index}`}>
                    <td>{index + 1}</td>
                    <td className="mono font-semibold">{item.sku}</td>
                    <td>{item.name || `สินค้า SKU ${item.sku}`}</td>
                    <td className="num">{item.qty}</td>
                    <td className="num">
                      {item.unitPrice !== undefined || index === 0
                        ? formatTHB(unitPrice)
                        : "-"}
                    </td>
                    <td className="num">
                      {item.lineTotal !== undefined || index === 0
                        ? formatTHB(lineTotal)
                        : "-"}
                    </td>
                  </tr>
                );
              })
            )}
            {invoice.discountTotal > 0 ? (
              <tr>
                <td colSpan={5}>หักส่วนลดร้านค้า / คูปอง</td>
                <td className="num">-{formatTHB(invoice.discountTotal)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={5}>ค่าจัดส่งที่เรียกเก็บจากลูกค้า</td>
              <td className="num">{formatTHB(invoice.shippingFee)}</td>
            </tr>
            <tr>
              <td colSpan={5}>มูลค่าสินค้า/บริการ (ก่อนภาษีมูลค่าเพิ่ม)</td>
              <td className="num">{formatTHB(invoice.preVatAmount)}</td>
            </tr>
            <tr>
              <td colSpan={5}>
                ภาษีมูลค่าเพิ่ม (VAT {invoice.seller.vatRate}%)
              </td>
              <td className="num">{formatTHB(invoice.vatAmount)}</td>
            </tr>
            <tr className="invoice-total-row">
              <td colSpan={5}>จำนวนเงินรวมทั้งสิ้น (รวมภาษีมูลค่าเพิ่ม)</td>
              <td className="num">{formatTHB(invoice.total)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: hasRichItems ? "56%" : "70%" }}>รายการ</th>
              {hasRichItems ? (
                <th style={{ width: "16%" }} className="num">
                  ราคา × จำนวน
                </th>
              ) : null}
              <th style={{ width: hasRichItems ? "28%" : "30%" }} className="num">
                จำนวนเงิน
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.length === 0 ? (
              <tr>
                <td colSpan={hasRichItems ? 2 : 1}>สินค้าตามคำสั่งซื้อ</td>
                <td className="num">{formatTHB(invoice.salesAmount)}</td>
              </tr>
            ) : (
              invoice.items.map((item, index) => (
                <tr key={`${item.sku}-${index}`}>
                  <td>
                    <strong className="mono">{item.sku}</strong>
                    {item.name ? ` · ${item.name}` : ""} × {item.qty}
                  </td>
                  {hasRichItems ? (
                    <td className="num">
                      {item.unitPrice !== undefined
                        ? `${formatTHB(item.unitPrice)} × ${item.qty}`
                        : "-"}
                    </td>
                  ) : null}
                  <td className="num">
                    {item.lineTotal !== undefined
                      ? formatTHB(item.lineTotal)
                      : index === 0
                        ? formatTHB(invoice.salesAmount)
                        : ""}
                  </td>
                </tr>
              ))
            )}
            {hasRichItems && invoice.discountTotal > 0 ? (
              <tr>
                <td colSpan={hasRichItems ? 2 : 1}>ส่วนลดร้านค้า</td>
                <td className="num">-{formatTHB(invoice.discountTotal)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={hasRichItems ? 2 : 1}>ค่าส่ง</td>
              <td className="num">{formatTHB(invoice.shippingFee)}</td>
            </tr>
            <tr className="invoice-total-row">
              <td colSpan={hasRichItems ? 2 : 1}>
                ราคารวมภาษีมูลค่าเพิ่ม (รวมทั้งสิ้น)
              </td>
              <td className="num">{formatTHB(invoice.total)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="invoice-baht-text">
        <span>จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</span>
        <span className="invoice-baht-value">- {invoice.totalText} -</span>
      </div>

      {isFull ? (
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-dashed border-[#ccc] pt-4 text-center text-xs text-[#333]">
          <div>
            <div className="mx-auto mt-6 w-44 border-b border-[#555]" />
            <p className="mt-1.5 font-semibold">ผู้รับเงิน / ผู้ออกเอกสาร</p>
            <p className="text-[11px] text-[#666]">{invoice.seller.name}</p>
          </div>
          <div>
            <div className="mx-auto mt-6 w-44 border-b border-[#555]" />
            <p className="mt-1.5 font-semibold">ผู้รับสินค้า / ลูกค้า</p>
            <p className="text-[11px] text-[#666]">
              {buyer.name || "ลูกค้าทั่วไป"}
            </p>
          </div>
        </div>
      ) : null}

      <footer className="invoice-thanks">
        <p>ขอบคุณที่อุดหนุนค่ะ</p>
      </footer>
    </article>
  );
}
