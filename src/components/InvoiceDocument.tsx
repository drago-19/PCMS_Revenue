import type { InvoiceCustomer, InvoiceModel } from "@/lib/invoice";
import { formatDate, formatDateLong, formatDateTime, formatTHB, round2 } from "@/lib/format";
import { formatSellerDisplayName } from "@/lib/seller";

const exactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatReceiptTHB(value: number): string {
  return `฿${exactCurrencyFormatter.format(round2(value))}`;
}

export type InvoiceMode = "abbreviated" | "full";
export type InvoicePaperSize = "a6" | "a4-4up" | "80mm" | "a4";

export function InvoiceDocument({
  invoice,
  compact = false,
  mode = "abbreviated",
  paperSize = "a4",
  buyerOverride,
}: {
  invoice: InvoiceModel;
  compact?: boolean;
  mode?: InvoiceMode;
  paperSize?: InvoicePaperSize;
  buyerOverride?: Partial<InvoiceCustomer>;
}) {
  const sellerDisplayName = formatSellerDisplayName(invoice.seller);
  const lines = [
    sellerDisplayName,
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
    fullAddressParts.length > 0
      ? fullAddressParts.join(" ")
      : invoice.createdDate
        ? `ลูกค้าทั่วไป (รอข้อมูลที่อยู่จากไฟล์ ออเดอร์ใน shipnity วันสั่งซื้อ ${formatDate(invoice.createdDate)})`
        : "ลูกค้าทั่วไป";

  const channelLabel = "TikTok Shop";
  const shippingCouponLabel = "ส่วนลดค่าจัดส่งจาก TikTok Shop";

  const isFull = mode === "full";
  const hasRichItems = invoice.items.some((item) => item.unitPrice !== undefined);
  const isSmallPaper =
    !isFull &&
    (paperSize === "a6" || paperSize === "a4-4up" || paperSize === "80mm");

  const useCustomerPaidBase =
    invoice.seller.vatCalculationBase === "customer_paid" ||
    invoice.payout <= 0;
  const showSkuAbbrev = invoice.seller.showSkuInAbbreviated === true;
  const showSkuFull = invoice.seller.showSkuInFull !== false;
  const showShippingTracking = invoice.seller.showShippingTracking !== false;
  const showSignatureBlock = invoice.seller.showSignatureBlock !== false;
  const footerNote = (invoice.seller.footerNote ?? "").trim();
  const sellerContactParts = [
    invoice.seller.phone ? `โทร. ${invoice.seller.phone}` : null,
    invoice.seller.email ? `อีเมล ${invoice.seller.email}` : null,
  ].filter(Boolean);
  const totalBarLabel = useCustomerPaidBase
    ? "ยอดที่ลูกค้าของคุณจ่าย (รวมภาษีมูลค่าเพิ่ม)"
    : "ยอดการชำระเงินทั้งหมด (รวมภาษีมูลค่าเพิ่ม)";

  if (!isFull) {
    if (isSmallPaper) {
      const is80mm = paperSize === "80mm";
      const is4Up = paperSize === "a4-4up";
      const itemCount = Math.max(1, invoice.items.length);
      const isDense = itemCount >= 3 || is4Up;
      const isUltraDense = itemCount >= 5;

      const baseFontClass = is80mm
        ? "text-[9px] leading-tight"
        : isUltraDense
          ? "text-[8.5px] leading-tight"
          : isDense
            ? "text-[9px] leading-tight"
            : "text-[9.5px] leading-snug";

      const smallContainerClass = is80mm
        ? `invoice invoice-paper-80mm mx-auto w-full max-w-[295px] p-2 ${baseFontClass} print:max-w-none print:p-0`
        : is4Up
          ? `invoice invoice-paper-4up mx-auto w-full max-w-[356px] break-inside-avoid rounded-md border border-[#cbd5e1] p-2 ${baseFontClass} print:max-w-none print:border print:border-[#cbd5e1] print:p-1.5`
          : `invoice invoice-paper-a6 mx-auto w-full max-w-[356px] p-2.5 ${baseFontClass} print:max-w-none print:p-0`;

      const printDensity =
        itemCount <= 2 ? "spacious" : itemCount <= 5 ? "medium" : "compact";

      const sectionGapClass = isUltraDense
        ? "mt-1 print:mt-1.5"
        : isDense
          ? "mt-1.5 print:mt-2"
          : "mt-1.5 print:mt-2.5";
      const cellPadClass = isUltraDense
        ? "px-1 py-[1.5px] print:py-1"
        : isDense
          ? "px-1.5 py-0.5 print:py-1"
          : "px-1.5 py-1 print:py-1.5";
      const rowPadClass = isUltraDense
        ? "py-[1px] print:py-0.5"
        : isDense
          ? "py-0.5 print:py-1"
          : "py-0.5 print:py-1";

      return (
        <article
          className={smallContainerClass}
          data-print-density={!is80mm && !is4Up ? printDensity : undefined}
        >
          {/* ส่วนหัวขนาดกะทัดรัด ย่อสัดส่วนตามกระดาษจริงโดยไม่ตัดคำ */}
          <header className="border-b-[1.5px] border-[#0f172a] pb-1">
            <div className="flex items-start justify-between gap-1.5">
              <h2
                className={`${is80mm || isUltraDense ? "text-[10.5px]" : "text-[11.5px]"} font-extrabold leading-tight text-[#0f172a]`}
              >
                {sellerDisplayName}
              </h2>
              <span className="shrink-0 rounded bg-[#0f172a] px-1.5 py-0.5 text-[8.5px] font-bold leading-none text-white">
                {channelLabel}
              </span>
            </div>
            <p className="mt-0.5 text-[8.5px] leading-tight text-[#334155]">
              {lines.slice(1).join(" ")}
            </p>
            {sellerContactParts.length > 0 ? (
              <p className="mt-0.5 text-[8.5px] leading-tight text-[#475569]">
                {sellerContactParts.join(" · ")}
              </p>
            ) : null}
            <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-[8.5px] text-[#334155]">
                เลขผู้เสียภาษี:{" "}
                <strong className="mono font-bold text-[#0f172a]">
                  {invoice.seller.taxId}
                </strong>
              </span>
              <h1
                className={`${is80mm || isUltraDense ? "text-[9.5px]" : "text-[10px]"} font-extrabold tracking-tight text-[#0f172a]`}
              >
                ใบเสร็จคำสั่งซื้อ / ใบกำกับภาษีอย่างย่อ
              </h1>
            </div>
          </header>

          {/* แถบอ้างอิงเอกสาร */}
          <div
            className={`${sectionGapClass} rounded border border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0.5 text-[8.5px] leading-tight text-[#1e293b]`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span>
                เลขที่ใบกำกับฯ:{" "}
                <strong className="mono font-bold text-[#0f172a]">
                  {invoice.invoiceNo ?? "-"}
                </strong>
              </span>
              <span>
                วันที่:{" "}
                <strong className="font-semibold text-[#0f172a]">
                  {invoice.paidDate
                    ? formatDateLong(invoice.paidDate)
                    : formatDateTime(invoice.issuedAt)}
                </strong>
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[#475569]">
              <span>
                ใบเสร็จ:{" "}
                <strong className="mono text-[#0f172a]">{invoice.receiptNo}</strong>
              </span>
            </div>
          </div>

          {/* ข้อมูลผู้รับ & คำสั่งซื้อ — ย่อสัดส่วนตามกระดาษและห้ามใช้ truncate (...) เด็ดขาด */}
          <div
            className={`${sectionGapClass} grid gap-1 border-b border-[#cbd5e1] pb-1 ${
              is80mm
                ? "grid-cols-1 text-[8.5px]"
                : "grid-cols-12 text-[8.5px]"
            }`}
          >
            <div className={is80mm ? "min-w-0" : "col-span-5 min-w-0 pr-1"}>
              <div className="font-extrabold text-[#0f172a]">ผู้รับ / ที่อยู่จัดส่ง</div>
              <p className="mt-0.5 font-bold leading-tight text-[#0f172a]">
                {buyer.name || "ลูกค้าทั่วไป"}
                {buyer.phone ? ` (${buyer.phone})` : ""}
              </p>
              <p className="mt-0.5 break-words leading-tight text-[#334155]">
                {fullAddress}
              </p>
            </div>
            <div
              className={
                is80mm
                  ? "min-w-0 border-t border-[#e2e8f0] pt-1"
                  : "col-span-7 min-w-0 border-l border-[#e2e8f0] pl-1.5"
              }
            >
              <div className="font-extrabold text-[#0f172a]">รายละเอียดคำสั่งซื้อ</div>
              <dl className="mt-0.5 space-y-[1px] leading-tight">
                <div className="flex items-baseline justify-between gap-1">
                  <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                    ออเดอร์ :
                  </dt>
                  <dd className="mono whitespace-nowrap text-right font-bold tracking-tight text-[#0f172a]">
                    {invoice.orderId}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-1">
                  <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                    วันสั่งซื้อ :
                  </dt>
                  <dd className="whitespace-nowrap text-right font-semibold text-[#0f172a]">
                    {invoice.createdDate
                      ? formatDateLong(invoice.createdDate)
                      : invoice.paidDate
                        ? formatDateLong(invoice.paidDate)
                        : "-"}
                  </dd>
                </div>
                {showShippingTracking && invoice.courier ? (
                  <div className="flex items-baseline justify-between gap-1">
                    <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                      ขนส่ง :
                    </dt>
                    <dd className="text-right font-medium text-[#0f172a]">
                      {invoice.courier}
                    </dd>
                  </div>
                ) : null}
                {showShippingTracking && invoice.trackingNo ? (
                  <div className="flex items-baseline justify-between gap-1">
                    <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                      เลขพัสดุ :
                    </dt>
                    <dd className="mono whitespace-nowrap text-right font-semibold tracking-tight text-[#0f172a]">
                      {invoice.trackingNo}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          {/* ตารางรายการสินค้า */}
          <div className={sectionGapClass}>
            <table
              className={`w-full border-collapse ${is80mm || isUltraDense ? "text-[8.5px]" : "text-[9px]"}`}
            >
              <thead>
                <tr className="border-y border-[#334155] bg-[#f1f5f9] text-[#0f172a]">
                  <th className={`${cellPadClass} text-left font-bold`}>รายละเอียด</th>
                  <th className={`w-10 ${cellPadClass} text-right font-bold whitespace-nowrap`}>
                    จำนวน
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] border-b border-[#cbd5e1]">
                {invoice.items.length === 0 ? (
                  <tr>
                    <td className={`${cellPadClass} text-[#0f172a]`}>
                      <span className="font-semibold">
                        สินค้าตามคำสั่งซื้อ #{invoice.orderId}
                      </span>
                      {invoice.createdDate ? (
                        <span className="ml-1 text-[8px] text-[#64748b]">
                          (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity วันสั่งซื้อ {formatDate(invoice.createdDate)})
                        </span>
                      ) : null}
                    </td>
                    <td className={`${cellPadClass} text-right font-bold tabular-nums text-[#0f172a]`}>
                      1
                    </td>
                  </tr>
                ) : (
                  invoice.items.map((item, index) => {
                    const isNumericPlatformSku = /^\d{10,}$/.test(item.sku);
                    return (
                      <tr key={`${item.sku}-${index}`}>
                        <td className={`${cellPadClass} leading-tight text-[#0f172a]`}>
                          <span className="font-semibold text-[#0f172a]">
                            {item.name || `รหัสสินค้า ${item.sku}`}
                          </span>
                          {!item.name && isNumericPlatformSku && invoice.createdDate ? (
                            <span className="ml-1 text-[8px] text-[#64748b]">
                              (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity วันสั่งซื้อ {formatDate(invoice.createdDate)})
                            </span>
                          ) : null}
                          {showSkuAbbrev && item.sku ? (
                            <span className="mono ml-1 text-[8px] text-[#64748b]">
                              [{item.sku}]
                            </span>
                          ) : null}
                        </td>
                        <td className={`${cellPadClass} text-right font-bold tabular-nums text-[#0f172a]`}>
                          {item.qty}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* สรุปยอด */}
          <div
            data-invoice-summary-block
            className={`${sectionGapClass} ${!is80mm && !is4Up ? "print:mt-auto print:pt-2" : ""} ${is80mm || isUltraDense ? "text-[8.5px]" : "text-[9px]"} leading-tight`}
          >
            {useCustomerPaidBase ? (
              <>
                <div className={`flex items-center justify-between border-b border-[#e2e8f0] ${rowPadClass} font-semibold text-[#0f172a]`}>
                  <span>ผลรวมย่อยของสินค้าก่อนหักส่วนลด</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.grossItemsTotal)}
                  </span>
                </div>
                {invoice.storeDiscount > 0 ? (
                  <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                    <span>
                      ส่วนลดค่าสินค้าจากผู้ขาย
                      {invoice.discountCode ? ` (${invoice.discountCode})` : ""}
                    </span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(invoice.storeDiscount)}
                    </span>
                  </div>
                ) : null}
                {invoice.platformCoupon > 0 ? (
                  <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                    <span>ส่วนลดสำหรับสินค้าจาก TikTok Shop</span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(invoice.platformCoupon)}
                    </span>
                  </div>
                ) : null}
                <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                  <span>ค่าธรรมเนียมการจัดส่งก่อนหักส่วนลด</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.shippingGross)}
                  </span>
                </div>
                <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                  <span>{shippingCouponLabel}</span>
                  <span className="tabular-nums">
                    - {formatReceiptTHB(invoice.shippingCoupon)}
                  </span>
                </div>
              </>
            ) : (
              <>
                {invoice.storeDiscount > 0 ? (
                  <>
                    <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                      <span>ยอดรวมค่าสินค้าก่อนหักส่วนลด</span>
                      <span className="tabular-nums">
                        {formatReceiptTHB(invoice.grossItemsTotal)}
                      </span>
                    </div>
                    <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                      <span>
                        ส่วนลดจากร้านค้า
                        {invoice.discountCode ? ` (${invoice.discountCode})` : ""}
                      </span>
                      <span className="tabular-nums">
                        - {formatReceiptTHB(invoice.storeDiscount)}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className={`flex items-center justify-between border-b border-[#e2e8f0] ${rowPadClass} font-semibold text-[#0f172a]`}>
                  <span>ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.salesAmount)}
                  </span>
                </div>
                {invoice.shippingFee > 0 ? (
                  <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                    <span>ค่าธรรมเนียมการจัดส่งของลูกค้า</span>
                    <span className="tabular-nums">
                      {formatReceiptTHB(invoice.shippingFee)}
                    </span>
                  </div>
                ) : null}
                {invoice.feeTotal !== 0 ? (
                  <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                    <span>ค่าธรรมเนียมทั้งหมด</span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(Math.abs(invoice.feeTotal))}
                    </span>
                  </div>
                ) : null}
                {invoice.adjustment !== 0 ? (
                  <div className={`flex items-center justify-between ${rowPadClass} text-[#1e293b]`}>
                    <span>จำนวนการปรับยอด</span>
                    <span className="tabular-nums">
                      {invoice.adjustment > 0 ? "+ " : "- "}
                      {formatReceiptTHB(Math.abs(invoice.adjustment))}
                    </span>
                  </div>
                ) : null}
              </>
            )}

            <div
              className={`flex items-center justify-between border-y-[1.5px] border-[#0f172a] bg-[#f8fafc] px-1 py-0.5 ${is80mm || isUltraDense ? "text-[9.5px]" : "text-[10px]"} font-extrabold text-[#0f172a]`}
            >
              <span>{totalBarLabel}</span>
              <span className="tabular-nums">
                {formatReceiptTHB(invoice.receiptTotal)}
              </span>
            </div>

            <div
              className="mt-0.5 space-y-[1px] px-0.5 text-[8.5px] text-[#475569]"
            >
              <div className="flex items-center justify-between">
                <span>มูลค่าสินค้า/บริการ (ก่อนภาษีมูลค่าเพิ่ม)</span>
                <span className="tabular-nums font-medium text-[#1e293b]">
                  {formatReceiptTHB(invoice.receiptPreVatAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>ภาษีมูลค่าเพิ่ม (VAT {invoice.seller.vatRate}%)</span>
                <span className="tabular-nums font-medium text-[#1e293b]">
                  {formatReceiptTHB(invoice.receiptVatAmount)}
                </span>
              </div>
            </div>
          </div>

          <div
            className="mt-1 flex flex-wrap items-center justify-between gap-1 border-t border-[#e2e8f0] pt-0.5 text-[8.5px] leading-tight"
          >
            <span className="text-[#475569]">รวมทั้งสิ้น (ตัวอักษร)</span>
            <span className="font-bold text-[#0f172a]">
              - {invoice.receiptTotalText} -
            </span>
          </div>

          {footerNote ? (
            <footer className="mt-1 text-center text-[8.5px] leading-tight text-[#475569]">
              <p className="font-semibold text-[#0f172a]">{footerNote}</p>
            </footer>
          ) : null}
        </article>
      );
    }

    return (
      <article className={`invoice${compact ? " invoice-compact" : ""}`}>
        {/* ส่วนหัวใบกำกับภาษีอย่างย่อ / ใบเสร็จคำสั่งซื้อ (รูปแบบทางการ) */}
        <header className="flex flex-col justify-between gap-3 border-b-2 border-[#0f172a] pb-3.5 sm:flex-row sm:items-end print:flex-row print:items-end">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-tight text-[#0f172a] sm:text-[18px]">
              {sellerDisplayName}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#334155]">
              {lines.slice(1).join(" ")}
            </p>
            {sellerContactParts.length > 0 ? (
              <p className="mt-0.5 text-xs text-[#475569]">
                {sellerContactParts.join(" · ")}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-[#334155]">
              เลขประจำตัวผู้เสียภาษีอากร{" "}
              <strong className="mono font-bold text-[#0f172a]">
                {invoice.seller.taxId}
              </strong>
            </p>
          </div>
          <div className="shrink-0 text-left sm:text-right print:text-right">
            <h1 className="text-lg font-extrabold tracking-tight text-[#0f172a] sm:text-xl sm:whitespace-nowrap print:text-xl print:whitespace-nowrap">
              ใบเสร็จคำสั่งซื้อ /{" "}
              <span className="inline-block whitespace-nowrap">
                ใบกำกับภาษีอย่างย่อ
              </span>
            </h1>
          </div>
        </header>

        {/* แถบอ้างอิงเอกสาร: หมายเลขใบเสร็จ, เลขที่ใบกำกับภาษี, วันที่ใบเสร็จ */}
        <div className="mt-3 rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3.5 py-2.5 text-xs text-[#1e293b]">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 print:grid-cols-2">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-semibold text-[#475569]">
                หมายเลขใบเสร็จ :
              </span>
              <span className="mono font-bold text-[#0f172a]">
                {invoice.receiptNo}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 sm:justify-end print:justify-end">
              <span className="shrink-0 font-semibold text-[#475569]">
                เลขที่ใบกำกับภาษี :
              </span>
              <span className="mono font-bold text-[#0f172a]">
                {invoice.invoiceNo ?? "-"}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-semibold text-[#475569]">
                วันที่ใบเสร็จ :
              </span>
              <span className="font-semibold text-[#0f172a]">
                {invoice.paidDate
                  ? formatDateLong(invoice.paidDate)
                  : formatDateTime(invoice.issuedAt)}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 sm:justify-end print:justify-end">
              <span className="shrink-0 font-semibold text-[#475569]">
                ช่องทางจำหน่าย :
              </span>
              <span className="font-semibold text-[#0f172a]">
                {channelLabel}
              </span>
            </div>
          </div>
        </div>

        {/* แถบ 3 คอลัมน์: รายละเอียดการส่งมอบ | ผู้ขาย | รายละเอียดคำสั่งซื้อ */}
        <div className="mt-3 grid grid-cols-1 gap-4 border-b border-[#cbd5e1] pb-3.5 pt-1 text-xs sm:grid-cols-12 sm:gap-0 print:grid-cols-12 print:gap-0">
          <div className="min-w-0 sm:col-span-3 sm:pr-3.5 print:col-span-3 print:pr-3.5">
            <h3 className="border-b border-[#e2e8f0] pb-1 text-xs font-extrabold text-[#0f172a]">
              รายละเอียดการส่งมอบ
            </h3>
            <p className="mt-1.5 font-bold text-[#0f172a]">
              {buyer.name || "ลูกค้าทั่วไป"}
              {buyer.phone ? (
                <span className="ml-1.5 font-normal text-[#475569]">
                  ({buyer.phone})
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 leading-relaxed text-[#334155]">{fullAddress}</p>
          </div>

          <div className="min-w-0 sm:col-span-4 sm:border-l sm:border-[#e2e8f0] sm:px-3.5 print:col-span-4 print:border-l print:border-[#e2e8f0] print:px-3.5">
            <h3 className="border-b border-[#e2e8f0] pb-1 text-xs font-extrabold text-[#0f172a]">
              ผู้ขาย
            </h3>
            <p className="mt-1.5 font-bold text-[#0f172a]">{sellerDisplayName}</p>
            <p className="mt-0.5 text-[#334155]">ช่องทาง: {channelLabel}</p>
            <p className="mt-0.5 text-[#334155]">
              เลขผู้เสียภาษี:{" "}
              <span className="mono text-xs font-semibold text-[#0f172a]">
                {invoice.seller.taxId}
              </span>
            </p>
          </div>

          <div className="min-w-0 sm:col-span-5 sm:border-l sm:border-[#e2e8f0] sm:pl-3.5 print:col-span-5 print:border-l print:border-[#e2e8f0] print:pl-3.5">
            <h3 className="border-b border-[#e2e8f0] pb-1 text-xs font-extrabold text-[#0f172a]">
              รายละเอียดคำสั่งซื้อ
            </h3>
            <dl className="mt-1.5 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                  หมายเลขคำสั่งซื้อ :
                </dt>
                <dd className="mono text-right text-xs font-bold tracking-tight text-[#0f172a]">
                  {invoice.orderId}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                  วันที่สั่งซื้อ :
                </dt>
                <dd className="text-right font-semibold text-[#0f172a]">
                  {invoice.createdDate
                    ? formatDateLong(invoice.createdDate)
                    : invoice.paidDate
                      ? formatDateLong(invoice.paidDate)
                      : "-"}
                </dd>
              </div>
              {showShippingTracking && invoice.courier ? (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                    ขนส่ง :
                  </dt>
                  <dd className="text-right font-medium text-[#0f172a]">
                    {invoice.courier}
                  </dd>
                </div>
              ) : null}
              {showShippingTracking && invoice.trackingNo ? (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 whitespace-nowrap text-[#475569]">
                    เลขพัสดุ :
                  </dt>
                  <dd className="mono text-right text-xs font-semibold tracking-tight text-[#0f172a]">
                    {invoice.trackingNo}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        {/* ตารางรายการสินค้า: รายละเอียด | จำนวน (ตรงตามต้นฉบับใบเสร็จคำสั่งซื้อ) */}
        <div className="mt-3">
          <table className="w-full border-collapse text-xs sm:text-[13px]">
            <thead>
              <tr className="border-y border-[#334155] bg-[#f1f5f9] text-[#0f172a]">
                <th className="px-3 py-2 text-left font-bold">รายละเอียด</th>
                <th className="w-24 px-3 py-2 text-right font-bold whitespace-nowrap">
                  จำนวน
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] border-b border-[#cbd5e1]">
              {invoice.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-2.5 text-[#0f172a]">
                    <span className="font-semibold">
                      สินค้าตามคำสั่งซื้อ #{invoice.orderId}
                    </span>
                    {invoice.createdDate ? (
                      <span className="ml-1.5 text-xs text-[#64748b]">
                        (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity วันสั่งซื้อ {formatDate(invoice.createdDate)})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#0f172a]">
                    1
                  </td>
                </tr>
              ) : (
                invoice.items.map((item, index) => {
                  const isNumericPlatformSku = /^\d{10,}$/.test(item.sku);
                  return (
                    <tr key={`${item.sku}-${index}`}>
                      <td className="px-3 py-2.5 leading-snug text-[#0f172a]">
                        {item.name ? (
                          <span className="font-semibold text-[#0f172a]">
                            {item.name}
                            {showSkuAbbrev && item.sku ? (
                              <span className="mono ml-1.5 text-xs font-normal text-[#64748b]">
                                [{item.sku}]
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <div>
                            <span className="mono font-semibold text-[#0f172a]">
                              รหัสสินค้า {item.sku}
                            </span>
                            {isNumericPlatformSku && invoice.createdDate ? (
                              <span className="ml-1.5 text-xs text-[#64748b]">
                                (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity วันสั่งซื้อ{" "}
                                {formatDate(invoice.createdDate)})
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#0f172a]">
                        {item.qty}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ตารางสรุปยอดด้านขวาล่าง แจงค่าต่างๆ ออกมาจากไฟล์ที่ Import จริง */}
        <div className="mt-3.5 flex justify-end">
          <div className="w-full max-w-sm text-xs sm:text-[13px]">
            {useCustomerPaidBase ? (
              <>
                <div className="flex items-center justify-between border-b border-[#e2e8f0] py-1.5 font-semibold text-[#0f172a]">
                  <span>ผลรวมย่อยของสินค้าก่อนหักส่วนลด</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.grossItemsTotal)}
                  </span>
                </div>
                {invoice.storeDiscount > 0 ? (
                  <div className="flex items-center justify-between py-1 text-[#1e293b]">
                    <span>
                      ส่วนลดค่าสินค้าจากผู้ขาย
                      {invoice.discountCode ? ` (${invoice.discountCode})` : ""}
                    </span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(invoice.storeDiscount)}
                    </span>
                  </div>
                ) : null}
                {invoice.platformCoupon > 0 ? (
                  <div className="flex items-center justify-between py-1 text-[#1e293b]">
                    <span>ส่วนลดสำหรับสินค้าจาก TikTok Shop</span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(invoice.platformCoupon)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between py-1 text-[#1e293b]">
                  <span>ค่าธรรมเนียมการจัดส่งก่อนหักส่วนลด</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.shippingGross)}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-1.5 pt-1 text-[#1e293b]">
                  <span>{shippingCouponLabel}</span>
                  <span className="tabular-nums">
                    - {formatReceiptTHB(invoice.shippingCoupon)}
                  </span>
                </div>
              </>
            ) : (
              <>
                {invoice.storeDiscount > 0 ? (
                  <>
                    <div className="flex items-center justify-between py-1 text-[#1e293b]">
                      <span>ยอดรวมค่าสินค้าก่อนหักส่วนลด</span>
                      <span className="tabular-nums">
                        {formatReceiptTHB(invoice.grossItemsTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-[#1e293b]">
                      <span>
                        ส่วนลดจากร้านค้า
                        {invoice.discountCode ? ` (${invoice.discountCode})` : ""}
                      </span>
                      <span className="tabular-nums">
                        - {formatReceiptTHB(invoice.storeDiscount)}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex items-center justify-between border-b border-[#e2e8f0] py-1.5 font-semibold text-[#0f172a]">
                  <span>ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย</span>
                  <span className="tabular-nums">
                    {formatReceiptTHB(invoice.salesAmount)}
                  </span>
                </div>
                {invoice.shippingFee > 0 ? (
                  <div className="flex items-center justify-between py-1 text-[#1e293b]">
                    <span>ค่าธรรมเนียมการจัดส่งของลูกค้า</span>
                    <span className="tabular-nums">
                      {formatReceiptTHB(invoice.shippingFee)}
                    </span>
                  </div>
                ) : null}
                {invoice.feeTotal !== 0 ? (
                  <div className="flex items-center justify-between py-1 text-[#1e293b]">
                    <span>ค่าธรรมเนียมทั้งหมด</span>
                    <span className="tabular-nums">
                      - {formatReceiptTHB(Math.abs(invoice.feeTotal))}
                    </span>
                  </div>
                ) : null}
                {invoice.adjustment !== 0 ? (
                  <div className="flex items-center justify-between py-1 text-[#1e293b]">
                    <span>จำนวนการปรับยอด</span>
                    <span className="tabular-nums">
                      {invoice.adjustment > 0 ? "+ " : "- "}
                      {formatReceiptTHB(Math.abs(invoice.adjustment))}
                    </span>
                  </div>
                ) : null}
              </>
            )}

            <div className="flex items-center justify-between border-y-2 border-[#0f172a] bg-[#f8fafc] px-3 py-2 text-sm font-extrabold text-[#0f172a]">
              <span>{totalBarLabel}</span>
              <span className="tabular-nums">
                {formatReceiptTHB(invoice.receiptTotal)}
              </span>
            </div>

            <div className="mt-1.5 space-y-1 px-1 text-xs text-[#475569]">
              <div className="flex items-center justify-between">
                <span>มูลค่าสินค้า/บริการ (ก่อนภาษีมูลค่าเพิ่ม)</span>
                <span className="tabular-nums font-medium text-[#1e293b]">
                  {formatReceiptTHB(invoice.receiptPreVatAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>ภาษีมูลค่าเพิ่ม (VAT {invoice.seller.vatRate}%)</span>
                <span className="tabular-nums font-medium text-[#1e293b]">
                  {formatReceiptTHB(invoice.receiptVatAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="invoice-baht-text mt-3.5 rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3.5 py-2 text-xs">
          <span className="font-semibold text-[#475569]">
            จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)
          </span>
          <span className="invoice-baht-value text-[#0f172a]">
            - {invoice.receiptTotalText} -
          </span>
        </div>

        {footerNote ? (
          <footer className="mt-3 text-center text-xs text-[#475569]">
            <p className="font-semibold text-[#0f172a]">{footerNote}</p>
          </footer>
        ) : null}
      </article>
    );
  }

  return (
    <article className={`invoice${compact ? " invoice-compact" : ""}`}>
      <header className="invoice-head">
        <div className="invoice-seller">
          <h2>{sellerDisplayName}</h2>
          {lines.slice(1).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {sellerContactParts.length > 0 ? (
            <p>{sellerContactParts.join(" · ")}</p>
          ) : null}
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
        {showShippingTracking && invoice.trackingNo ? (
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
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 print:grid-cols-2">
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
            <div className="mt-1.5 border-t border-[#e2e8f0] pt-1.5">
              <span className="invoice-label block">ที่อยู่ผู้ซื้อ</span>
              <span className="text-[12.5px] text-[#222]">{fullAddress}</span>
            </div>
          )}
        </div>
      ) : null}

      {isFull ? (
        <div className="w-full overflow-x-auto print:overflow-visible">
          <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>ลำดับ</th>
              {showSkuFull ? (
                <th style={{ width: "18%" }}>รหัสสินค้า (SKU)</th>
              ) : null}
              <th style={{ width: showSkuFull ? "36%" : "54%" }}>รายการสินค้า</th>
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
                {showSkuFull ? <td className="mono">-</td> : null}
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
                    {showSkuFull ? (
                      <td className="mono font-semibold">{item.sku}</td>
                    ) : null}
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
            {useCustomerPaidBase ? (
              <>
                {invoice.discountTotal > 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>ส่วนลดค่าสินค้าจากผู้ขาย</td>
                    <td className="num">-{formatTHB(invoice.discountTotal)}</td>
                  </tr>
                ) : null}
                {invoice.platformCoupon > 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>
                      ส่วนลดสำหรับสินค้าจาก TikTok Shop
                    </td>
                    <td className="num">-{formatTHB(invoice.platformCoupon)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={showSkuFull ? 5 : 4}>
                    ค่าธรรมเนียมการจัดส่งก่อนหักส่วนลด
                  </td>
                  <td className="num">{formatTHB(invoice.shippingGross)}</td>
                </tr>
                {invoice.shippingCoupon > 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>
                      ส่วนลดค่าจัดส่งจาก TikTok Shop
                    </td>
                    <td className="num">-{formatTHB(invoice.shippingCoupon)}</td>
                  </tr>
                ) : null}
              </>
            ) : (
              <>
                {invoice.discountTotal > 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>ส่วนลดจากร้านค้า</td>
                    <td className="num">-{formatTHB(invoice.discountTotal)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={showSkuFull ? 5 : 4}>
                    ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย
                  </td>
                  <td className="num">{formatTHB(invoice.salesAmount)}</td>
                </tr>
                {invoice.shippingFee > 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>
                      ค่าธรรมเนียมการจัดส่งของลูกค้า
                    </td>
                    <td className="num">{formatTHB(invoice.shippingFee)}</td>
                  </tr>
                ) : null}
                {invoice.feeTotal !== 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>ค่าธรรมเนียมทั้งหมด</td>
                    <td className="num">-{formatTHB(Math.abs(invoice.feeTotal))}</td>
                  </tr>
                ) : null}
                {invoice.adjustment !== 0 ? (
                  <tr>
                    <td colSpan={showSkuFull ? 5 : 4}>จำนวนการปรับยอด</td>
                    <td className="num">{formatTHB(invoice.adjustment)}</td>
                  </tr>
                ) : null}
              </>
            )}
            <tr>
              <td colSpan={showSkuFull ? 5 : 4}>
                มูลค่าสินค้า/บริการ (ก่อนภาษีมูลค่าเพิ่ม)
              </td>
              <td className="num">{formatTHB(invoice.preVatAmount)}</td>
            </tr>
            <tr>
              <td colSpan={showSkuFull ? 5 : 4}>
                ภาษีมูลค่าเพิ่ม (VAT {invoice.seller.vatRate}%)
              </td>
              <td className="num">{formatTHB(invoice.vatAmount)}</td>
            </tr>
            <tr className="invoice-total-row">
              <td colSpan={showSkuFull ? 5 : 4}>{totalBarLabel}</td>
              <td className="num">{formatTHB(invoice.total)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      ) : (
        <div className="w-full overflow-x-auto print:overflow-visible">
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
        </div>
      )}

      <div className="invoice-baht-text">
        <span>จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</span>
        <span className="invoice-baht-value">- {invoice.totalText} -</span>
      </div>

      {isFull && showSignatureBlock ? (
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-[#cbd5e1] pt-4 text-center text-xs text-[#333]">
          <div>
            <div className="mx-auto mt-6 w-44 border-b border-[#555]" />
            <p className="mt-1.5 font-semibold">ผู้รับเงิน / ผู้ออกเอกสาร</p>
            <p className="text-[11px] text-[#666]">{sellerDisplayName}</p>
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

      {footerNote ? (
        <footer className="invoice-thanks">
          <p>{footerNote}</p>
        </footer>
      ) : null}
    </article>
  );
}
