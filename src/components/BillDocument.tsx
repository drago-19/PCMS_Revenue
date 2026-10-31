import Link from "next/link";
import type { BillModel } from "@/lib/bill";
import type { OmsLineItem } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, formatDateTime, formatTHB } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { IconAlert, IconCheckCircle, IconHelp } from "./icons";

export function BillDocument({
  bill,
  source,
  invoiceNo,
  channel = "TikTok",
  orderCode,
  customerName,
  trackingNo,
  courier,
  discountCode,
  marketplaceOrderRaw,
  productDetail,
  omsItems,
  omsNote,
  isNoProductPriceOrder,
}: {
  bill: BillModel;
  source: { filename: string; importedAt: string; importId: number };
  invoiceNo?: string | null;
  channel?: string;
  orderCode?: string | null;
  customerName?: string | null;
  trackingNo?: string | null;
  courier?: string | null;
  discountCode?: string | null;
  discountTotal?: number;
  shippingFeeCustomer?: number;
  shippingFeeSeller?: number;
  marketplaceOrderRaw?: string | null;
  productDetail?: string | null;
  omsItems?: OmsLineItem[];
  omsNote?: string | null;
  isNoProductPriceOrder?: boolean;
}) {
  const isOmsPlaceholder = bill.transactionType === "คำสั่งซื้อ (OMS)";
  const hasFees =
    bill.feeGroups.length > 0 ||
    bill.feeExtraLines.length > 0 ||
    bill.feeTotal !== 0;

  const isOmsChannel = channel === "Shopee" || channel === "Facebook";
  const channelLabel =
    channel === "Shopee"
      ? "Shopee"
      : channel === "Facebook"
        ? "Facebook"
        : "TikTok Shop";
  const cpb = bill.customerPaymentBreakdown;
  const customerPaidTotal = cpb?.total ?? bill.customerPayment;
  const hasCustomerPaymentSection = customerPaidTotal > 0;
  const hasCustomerSpecificDiff =
    hasCustomerPaymentSection &&
    cpb !== undefined &&
    (cpb.tiktokProductDiscount !== 0 ||
      cpb.shippingAfterDiscount > 0 ||
      cpb.sellerShippingDiscount !== 0 ||
      Math.abs(customerPaidTotal - bill.incomeTotal) >= 0.01);

  const productBeforeLine = bill.incomeLines.find(
    (line) => line.key === "productBeforeDiscount",
  );
  const incomeHeaderAmount =
    productBeforeLine && productBeforeLine.amount !== 0
      ? productBeforeLine.amount
      : bill.incomeTotal;

  const visibleIncomeLines = [
    ...bill.incomeLines.filter((line) => line.key === "productBeforeDiscount"),
    ...bill.incomeLines.filter(
      (line) =>
        line.key !== "productBeforeDiscount" &&
        line.key !== "productAfterDiscount" &&
        line.key !== "refundAfterDiscount",
    ),
    ...bill.incomeLines.filter(
      (line) =>
        line.key === "productAfterDiscount" ||
        line.key === "refundAfterDiscount",
    ),
  ];

  const extraReferenceLines = [
    bill.rowIndexes && bill.rowIndexes.length > 0
      ? `บรรทัดในไฟล์ Excel: แถวที่ ${bill.rowIndexes.join(", ")}${
          bill.sourceRows > 1 ? ` (รวม ${bill.sourceRows} แถว)` : ""
        }`
      : null,
    bill.productDetail &&
    !["/", "-", "--", "N/A"].includes(bill.productDetail.trim())
      ? `รายละเอียดสินค้าในไฟล์: ${bill.productDetail}`
      : null,
  ].filter(Boolean);

  return (
    <article className="bill-card">
      <header className="bill-card-head">
        <div>
          <p className="bill-kicker">{channelLabel} · รายละเอียดรายได้</p>
          <h2>การแจกแจงรายละเอียดการชำระเงิน</h2>
        </div>
        <div className="bill-head-side">
          <Badge variant="glass" className="bill-head-badge">
            {bill.checks.ok ? (
              <>
                <IconCheckCircle size={15} /> ตรวจยอดแล้ว
              </>
            ) : (
              <>
                <IconAlert size={15} /> มียอดไม่ลงตัว
              </>
            )}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline-light"
                size="icon-xs"
                aria-label="ข้อมูลอ้างอิงบิล"
                className="bill-help no-print rounded-full"
              >
                <IconHelp size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="no-print">
              ยอดทั้งหมดอ้างอิงจากไฟล์ export และจับคู่รหัสสินค้าจาก shipnity
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <dl className="bill-meta">
        <div>
          <dt>หมายเลขคำสั่งซื้อ ({channelLabel})</dt>
          <dd className="mono">
            {bill.externalId.includes("|")
              ? orderCode || bill.externalId.split("|")[0] || bill.externalId
              : bill.externalId}
            <CopyButton
              value={
                bill.externalId.includes("|")
                  ? orderCode || bill.externalId.split("|")[0] || bill.externalId
                  : bill.externalId
              }
            />
          </dd>
        </div>
        <div>
          <dt>รหัสออเดอร์ shipnity</dt>
          {orderCode ? (
            <dd className="mono">#{orderCode}</dd>
          ) : (
            <dd className="bill-empty-hint">
              รอไฟล์ ออเดอร์ใน shipnity ({formatDate(bill.createdAt)})
            </dd>
          )}
        </div>
        {marketplaceOrderRaw && marketplaceOrderRaw !== bill.externalId ? (
          <div>
            <dt>เลขคำสั่งซื้อบน Marketplace</dt>
            <dd className="mono">
              {marketplaceOrderRaw}
              <CopyButton value={marketplaceOrderRaw} />
            </dd>
          </div>
        ) : null}
        <div>
          <dt>เลขที่ใบกำกับภาษี</dt>
          {isNoProductPriceOrder ? (
            <dd className="bill-empty-hint font-semibold break-words text-[#6d28d9]">
              ไม่ออกใบกำกับฯ (เปลี่ยนสินค้า)
            </dd>
          ) : isOmsChannel && bill.payout <= 0 ? (
            <dd className="bill-empty-hint font-semibold break-words text-[#b45309]">
              ไม่ออกใบกำกับฯ (ติดลบ / ตีกลับ)
            </dd>
          ) : invoiceNo ? (
            <dd className="mono">{invoiceNo}</dd>
          ) : !isOmsPlaceholder && bill.incomeTotal <= 0 && bill.payout <= 0 ? (
            <dd className="bill-empty-hint break-words">ไม่ออกใบกำกับฯ (ยอด 0 บาท)</dd>
          ) : (
            <dd className="bill-empty-hint">รอไฟล์ ออเดอร์ใน shipnity</dd>
          )}
        </div>
        <div>
          <dt>ชื่อลูกค้า</dt>
          {customerName ? (
            <dd>{customerName}</dd>
          ) : (
            <dd className="bill-empty-hint">รอไฟล์ ออเดอร์ใน shipnity</dd>
          )}
        </div>
        <div>
          <dt>เลขพัสดุ</dt>
          {trackingNo ? (
            <dd className="mono">
              {trackingNo}
              {courier ? ` (${courier})` : ""}
            </dd>
          ) : (
            <dd className="bill-empty-hint">รอไฟล์ ออเดอร์ใน shipnity</dd>
          )}
        </div>
        <div>
          <dt>วันที่สร้างคำสั่งซื้อ</dt>
          <dd>{formatDate(bill.createdAt)}</dd>
        </div>
        <div>
          <dt>วันที่ชำระเงิน</dt>
          <dd>{formatDate(bill.paidAt)}</dd>
        </div>
        <div>
          <dt>ประเภทธุรกรรม</dt>
          <dd>
            {bill.transactionType === "คำสั่งซื้อ (OMS)"
              ? "คำสั่งซื้อ (ออเดอร์ใน shipnity)"
              : bill.transactionType}
          </dd>
        </div>
        {bill.weightEstimated !== null ? (
          <div>
            <dt>น้ำหนักพัสดุโดยประมาณ</dt>
            <dd>{bill.weightEstimated.toLocaleString("th-TH")} ก.</dd>
          </div>
        ) : null}
        {bill.sourceRows > 1 ? (
          <div>
            <dt>จำนวนแถวที่รวมในบิล</dt>
            <dd>{bill.sourceRows} แถว</dd>
          </div>
        ) : null}
        {omsNote ? (
          <div className="col-span-full">
            <dt>หมายเหตุจากไฟล์ Shipnity</dt>
            <dd className="font-semibold text-[#b45309]">{omsNote}</dd>
          </div>
        ) : null}
      </dl>

      {isNoProductPriceOrder ? (
        <section className="mx-4 mt-3.5 rounded-xl border border-[#c4b5fd] bg-[#f5f3ff] p-3.5 text-xs text-[#4c1d95] sm:mx-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ddd6fe] pb-2">
            <div className="flex items-center gap-1.5 font-extrabold text-[13px] text-[#5b21b6]">
              <IconAlert size={16} className="shrink-0 text-[#7c3aed]" />
              <span>
                คำชี้แจง: ออเดอร์เปลี่ยนสินค้า / ไม่มีราคาสินค้า (ไม่นำไปยื่นภาษี)
              </span>
            </div>
            <Badge
              variant="neutral"
              size="sm"
              className="border-[#c4b5fd] bg-white font-bold text-[#6d28d9]"
            >
              ราคาสินค้า {formatTHB(0)}
            </Badge>
          </div>
          <div className="mt-2 space-y-1.5 leading-relaxed text-[#4c1d95]">
            <p>
              • ออเดอร์นี้มี<strong>ราคาสินค้า {formatTHB(0)}</strong>{" "}
              (เก็บเฉพาะค่าธรรมเนียมจัดส่ง {formatTHB(bill.shippingCustomerFee || bill.incomeTotal)})
              เนื่องจากเป็นการส่งเปลี่ยนไซส์/เปลี่ยนสินค้าให้ลูกค้าตามบิลสั่งซื้อเดิมที่ยื่นภาษีไปแล้ว
            </p>
            {omsNote ? (
              <p>
                • <strong>หมายเหตุในไฟล์ Shipnity:</strong>{" "}
                <span className="rounded bg-white px-1.5 py-0.5 font-bold text-[#5b21b6]">
                  {omsNote}
                </span>
              </p>
            ) : null}
            <p>
              • ระบบแยกออเดอร์ประเภทนี้ออกจากหมวดบิลขายปกติและตัดออกจากทะเบียนใบกำกับภาษีอัตโนมัติเพื่อไม่ให้ยื่นภาษีซ้ำซ้อน
            </p>
          </div>
        </section>
      ) : null}

      {isOmsChannel && bill.payout <= 0 ? (
        (() => {
          const isFullReturn =
            bill.incomeTotal > 0 &&
            Math.abs(bill.feeTotal) >= bill.incomeTotal - 0.01;
          const netCashBeforeCogs = Number(
            (bill.incomeTotal + bill.feeTotal).toFixed(2),
          );
          const totalQty =
            omsItems?.reduce((acc, it) => acc + it.quantity, 0) ?? 0;

          const reasonTitle =
            bill.payout === 0 && isFullReturn
              ? "สาเหตุที่กำไรสุทธิเป็น 0.00 บาท: ลูกค้าตีกลับ/ยกเลิกเต็มจำนวน 100% (ถูกหักยอดขายคืนเต็มจำนวน)"
              : bill.payout < 0 && isFullReturn
                ? `สาเหตุที่ติดลบ ${formatTHB(bill.payout)}: ออเดอร์ถูกหักยอดขายคืนเต็มจำนวน และถูกหักต้นทุนสินค้าตัดสต็อก ${formatTHB(bill.cogsTotal)}`
                : bill.payout < 0
                  ? `สาเหตุที่ติดลบ ${formatTHB(bill.payout)} (ตามช่องกำไรในไฟล์ Shipnity): เหลือเงินหลังหักค่าส่ง/ค่าธรรมเนียม ${formatTHB(netCashBeforeCogs)} แต่หักต้นทุนสินค้าตัดสต็อก ${formatTHB(bill.cogsTotal)}`
                  : `แจกแจงที่มาของยอด ${formatTHB(bill.payout)} (ตามไฟล์ Shipnity)`;

          return (
            <section className="mx-4 mt-3.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5 text-xs text-[#92400e] sm:mx-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#fde68a] pb-2">
                <div className="flex items-center gap-1.5 font-extrabold text-[13px] text-[#b45309]">
                  <IconAlert size={16} className="shrink-0 text-[#d97706]" />
                  <span>{reasonTitle}</span>
                </div>
                <Badge
                  variant={bill.payout < 0 ? "danger" : "warning"}
                  size="sm"
                  className="font-bold"
                >
                  กำไรตามไฟล์ Shipnity {formatTHB(bill.payout)}
                </Badge>
              </div>

              <div className="mt-2.5 rounded-lg border border-[#fde68a] bg-white p-2.5 text-[#1e293b]">
                <div className="mb-1.5 text-[11.5px] font-bold text-[#475569]">
                  ตารางเทียบตัวเลขจริงทุกคอลัมน์ในไฟล์ Excel ของ Shipnity ({source.filename}):
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>1. ช่อง &ldquo;ยอดขาย&rdquo; ในไฟล์ Shipnity (คอลัมน์ U)</span>
                    <span className="mono font-bold text-[#0f172a]">
                      {formatTHB(bill.incomeTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      2. หักช่อง &ldquo;ค่าส่งที่ร้านจ่าย&rdquo; ในไฟล์ Shipnity (คอลัมน์ K)
                    </span>
                    <span className="mono font-bold text-[#dc2626]">
                      {formatTHB(bill.feeTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-dashed border-[#cbd5e1] pt-1 font-semibold text-[#047857]">
                    <span>
                      = ยอดเงินคงเหลือหลังหักค่าส่ง/ค่าธรรมเนียม (ยอดขาย - ค่าส่งที่ร้านจ่าย)
                    </span>
                    <span className="mono font-bold">
                      {formatTHB(netCashBeforeCogs)}
                    </span>
                  </div>
                  {bill.cogsTotal > 0 ? (
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[#dc2626]">
                      <span>
                        3. หักต้นทุนสินค้าตัดสต็อกในระบบ Shipnity ({totalQty > 0 ? `${totalQty} ชิ้น` : "ตามตั้งค่าสต็อก"})
                      </span>
                      <span className="mono font-bold">
                        {formatTHB(-bill.cogsTotal)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 border-t border-[#e2e8f0] pt-1.5 font-extrabold text-[12.5px]">
                    <span>
                      = ช่อง &ldquo;กำไร&rdquo; ในไฟล์ Shipnity (คอลัมน์ V · ยอดชำระสุทธิ)
                    </span>
                    <span
                      className={`mono ${
                        bill.payout < 0 ? "text-[#dc2626]" : "text-[#0f172a]"
                      }`}
                    >
                      {formatTHB(bill.payout)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-[#92400e]">
                <p>
                  • <strong>คำอธิบายที่มาของยอดติดลบ:</strong> ในไฟล์{" "}
                  <strong>{source.filename}</strong> ออเดอร์นี้มี{" "}
                  <strong>ช่องยอดขาย = {formatTHB(bill.incomeTotal)}</strong> หัก{" "}
                  <strong>ช่องค่าส่งที่ร้านจ่าย = {formatTHB(bill.feeTotal)}</strong>{" "}
                  (เหลือเงินสดก่อนหักต้นทุน <strong>{formatTHB(netCashBeforeCogs)}</strong>)
                  {bill.cogsTotal > 0 ? (
                    <>
                      {" "}จากนั้นระบบสต็อกของ Shipnity หัก{" "}
                      <strong>ต้นทุนสินค้าในคลังออกอีก {formatTHB(-bill.cogsTotal)}</strong>{" "}
                      จึงทำให้ช่อง &ldquo;กำไร&rdquo; ในไฟล์ติดลบเป็น{" "}
                      <strong className="text-[#dc2626]">{formatTHB(bill.payout)}</strong>
                    </>
                  ) : null}
                </p>
                <p>
                  • <strong>การจัดการภาษี:</strong> ออเดอร์ที่ติดลบหรือยอด 0 บาทถูกแยกไว้ในหมวด{" "}
                  <strong>คืนเงิน / ตีกลับ / ขาดทุน (ติดลบ)</strong> และ{" "}
                  <strong>ไม่นำมาออกใบกำกับภาษีขาย</strong> เพื่อป้องกันการยื่นภาษีเกินจริง
                </p>
                {omsNote ? (
                  <p>
                    • <strong>หมายเหตุจากไฟล์ Shipnity:</strong>{" "}
                    <span className="rounded bg-white px-1.5 py-0.5 font-bold text-[#b45309]">
                      {omsNote}
                    </span>
                  </p>
                ) : null}
              </div>
            </section>
          );
        })()
      ) : channel === "TikTok" && bill.payout < 0 ? (
        <section className="mx-4 mt-3.5 rounded-xl border border-[#fecaca] bg-[#fff1f2] p-3.5 text-xs text-[#881337] sm:mx-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#fecdd3] pb-2">
            <div className="flex items-center gap-1.5 font-extrabold text-[13px] text-[#be123c]">
              <IconAlert size={16} className="shrink-0 text-[#e11d48]" />
              <span>
                สาเหตุที่ยอดสุทธิติดลบ (อ้างอิงไฟล์ TikTok Settlement)
              </span>
            </div>
            <Badge
              variant="danger"
              size="sm"
              className="bg-[#e11d48] font-bold text-white"
            >
              ยอดหักสุทธิ {formatTHB(bill.payout)}
            </Badge>
          </div>
          <div className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-[#9f1239]">
            <p>
              • รายการนี้มียอดรายได้{" "}
              <strong>{formatTHB(bill.incomeTotal)}</strong> และถูกหักค่าธรรมเนียม/ค่าขนส่งตีกลับ{" "}
              <strong>{formatTHB(bill.feeTotal)}</strong>
              {bill.adjustment !== 0
                ? ` (ปรับยอด ${formatTHB(bill.adjustment)})`
                : ""}{" "}
              ส่งผลให้ยอดโอนสุทธิในรอบบัญชีนี้ติดลบ{" "}
              <strong>{formatTHB(bill.payout)}</strong> ตามรายงานของ TikTok Shop
            </p>
            {omsNote ? (
              <p>
                • <strong>หมายเหตุจากไฟล์ Shipnity:</strong>{" "}
                <span className="rounded bg-white px-1.5 py-0.5 font-bold text-[#be123c]">
                  {omsNote}
                </span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="bill-section">
        <div className="bill-section-head">
          <span>
            รายการสินค้า{" "}
            {omsItems && omsItems.length > 0 ? (
              <span>({omsItems.length} รายการ)</span>
            ) : (
              <span className="text-[11px] font-normal text-[#64748b]">
                (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity)
              </span>
            )}
          </span>
          {omsItems && omsItems.length > 0 ? (
            <span>
              {omsItems.reduce((acc, it) => acc + it.quantity, 0)} ชิ้น
            </span>
          ) : (
            <span className="text-[11px] font-normal text-[#94a3b8]">
              วันสั่งซื้อ {formatDate(bill.createdAt)}
            </span>
          )}
        </div>
        <div className="bill-rows">
          {omsItems && omsItems.length > 0 ? (
            <>
              {(() => {
                const listTotal = omsItems.reduce(
                  (acc, it) => acc + it.unitPrice * it.quantity,
                  0,
                );
                const customerItemsTotal =
                  bill.customerPayment > 0
                    ? Math.max(0, bill.customerPayment - bill.shippingCustomerFee)
                    : bill.incomeTotal;
                return omsItems.map((it, idx) => {
                  const netUnit =
                    listTotal > 0
                      ? (customerItemsTotal * it.unitPrice) / listTotal
                      : it.unitPrice;
                  const lineNetTotal = netUnit * it.quantity;
                  return (
                    <div key={`${it.skuCode}-${idx}`} className="bill-row">
                      <span>
                        <strong className="mono">{it.skuCode}</strong> ·{" "}
                        {it.productName} × {it.quantity}{" "}
                        {omsItems.length > 1 || it.quantity > 1 ? (
                          <span className="text-xs text-muted-foreground">
                            (ราคาตั้งต้น {formatTHB(it.unitPrice)}/ชิ้น)
                          </span>
                        ) : null}
                      </span>
                      <span className="amount">
                        {formatTHB(lineNetTotal)}
                      </span>
                    </div>
                  );
                });
              })()}
            </>
          ) : (
            <>
              {productDetail && productDetail !== "/" ? (
                <div className="bill-row">
                  <span>
                    รหัสสินค้า ({channelLabel}):{" "}
                    <strong className="mono">
                      {productDetail.replace(/;\s*$/, "")}
                    </strong>{" "}
                    <span className="text-[11px] font-normal text-[#94a3b8]">
                      (รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity)
                    </span>
                  </span>
                  <span className="amount">{formatTHB(bill.incomeTotal)}</span>
                </div>
              ) : null}
              <div className="bill-row muted">
                <span className="text-[11.5px] font-normal text-[#94a3b8]">
                  {orderCode
                    ? `ผูก #${orderCode} แล้ว — รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity`
                    : `ยังไม่มีข้อมูลสินค้า — รอชื่อสินค้าจากไฟล์ สินค้าในออเดอร์ shipnity (${formatDate(bill.createdAt)})`}
                </span>
                <span className="amount text-[11px] font-normal text-[#94a3b8]">
                  รอไฟล์ สินค้าในออเดอร์ shipnity
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {hasCustomerSpecificDiff && cpb ? (
        <section className="bill-section">
          <div className="bill-section-head">
            <span>ยอดที่ลูกค้าของคุณจ่าย</span>
            <span>{formatTHB(customerPaidTotal)}</span>
          </div>
          <div className="bill-rows">
            {cpb.shippingAfterDiscount > 0 || cpb.sellerShippingDiscount !== 0 ? (
              <div className="bill-row font-semibold">
                <span>ผลรวมย่อยของสินค้าหลังจากหักส่วนลด</span>
                <span className="amount">
                  {formatTHB(cpb.productSubtotalAfterDiscount)}
                </span>
              </div>
            ) : null}
            {cpb.sellerProductDiscount !== 0 || cpb.tiktokProductDiscount !== 0 ? (
              <>
                <div className="bill-row child">
                  <span>ผลรวมย่อยของสินค้าก่อนหักส่วนลด</span>
                  <span className="amount">
                    {formatTHB(cpb.productSubtotalBeforeDiscount)}
                  </span>
                </div>
                {cpb.sellerProductDiscount !== 0 ? (
                  <div className="bill-row child">
                    <span>
                      ส่วนลดค่าสินค้าจากผู้ขาย
                      {discountCode ? ` (โค้ด: ${discountCode})` : ""}
                    </span>
                    <span className="amount danger">
                      {formatTHB(cpb.sellerProductDiscount)}
                    </span>
                  </div>
                ) : null}
                {cpb.tiktokProductDiscount !== 0 ? (
                  <div className="bill-row child">
                    <span>ส่วนลดสำหรับสินค้าจาก {channelLabel}</span>
                    <span className="amount danger">
                      {formatTHB(cpb.tiktokProductDiscount)}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
            {cpb.shippingAfterDiscount > 0 || cpb.sellerShippingDiscount !== 0 ? (
              <>
                <div className="bill-row font-semibold">
                  <span>ค่าธรรมเนียมการจัดส่งหลังจากหักส่วนลด</span>
                  <span className="amount">
                    {formatTHB(cpb.shippingAfterDiscount)}
                  </span>
                </div>
                {cpb.shippingBeforeDiscount > 0 &&
                (cpb.sellerShippingDiscount !== 0 ||
                  cpb.tiktokShippingDiscount !== 0) ? (
                  <div className="bill-row child">
                    <span>ค่าธรรมเนียมการจัดส่งก่อนหักส่วนลด</span>
                    <span className="amount">
                      {formatTHB(cpb.shippingBeforeDiscount)}
                    </span>
                  </div>
                ) : null}
                {cpb.sellerShippingDiscount !== 0 ? (
                  <div className="bill-row child">
                    <span>ส่วนลดค่าจัดส่งจากผู้ขาย</span>
                    <span className="amount danger">
                      {formatTHB(cpb.sellerShippingDiscount)}
                    </span>
                  </div>
                ) : null}
                {cpb.tiktokShippingDiscount !== 0 ? (
                  <div className="bill-row child">
                    <span>ส่วนลดค่าจัดส่งจาก {channelLabel}</span>
                    <span className="amount danger">
                      {formatTHB(cpb.tiktokShippingDiscount)}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="bill-section">
        <div className="bill-section-head">
          <span>รายได้</span>
          <span>{formatTHB(incomeHeaderAmount)}</span>
        </div>
        {visibleIncomeLines.length > 0 ? (
          <div className="bill-rows">
            {visibleIncomeLines.map((line) => (
              <div
                key={line.key}
                className={`bill-row${line.depth === 1 ? " child" : " font-semibold"}${
                  line.kind === "unknown" ? " unknown" : ""
                }`}
              >
                <span>
                  {line.key === "storeDiscount"
                    ? discountCode
                      ? `${line.label} (แฟลชเซลล์ · โค้ด: ${discountCode})`
                      : `${line.label} (แฟลชเซลล์)`
                    : line.label}
                </span>
                <span className={`amount${line.amount < 0 ? " danger" : ""}`}>
                  {formatTHB(line.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {channel !== "Facebook" || bill.feeTotal !== 0 ? (
        <section className="bill-section">
          <div className="bill-section-head fee">
            <span>ค่าธรรมเนียมทั้งหมด</span>
            <span>{formatTHB(bill.feeTotal)}</span>
          </div>
          <div className="bill-rows">
            {!hasFees ? (
              <div className="bill-row muted">
                <span className="text-[11.5px] font-normal text-[#94a3b8]">
                  {isOmsPlaceholder
                    ? isOmsChannel
                      ? `คำสั่งซื้อจาก ${channelLabel} (ออเดอร์ใน shipnity)`
                      : "ยังไม่มีข้อมูลรายได้จาก TikTok"
                    : "ไม่มีค่าธรรมเนียมที่ถูกหักในคำสั่งซื้อนี้"}
                </span>
                <span className="amount">{formatTHB(0)}</span>
              </div>
            ) : null}
            {bill.feeGroups.map((group) => (
              <div key={group.key} className="bill-group">
                <div className="bill-row group">
                  <span>
                    {isOmsPlaceholder && isOmsChannel && group.key === "shipping"
                      ? "ยอดรวมค่าธรรมเนียมและค่าส่งที่ร้านจ่าย"
                      : group.label}
                  </span>
                  <span className="amount">{formatTHB(group.amount)}</span>
                </div>
                {group.children.map((child) => (
                  <div
                    key={`${group.key}-${child.key}`}
                    className={`bill-row child${
                      child.depth === 2 ? " pl-7 text-[12px] text-[#475569]" : ""
                    }`}
                  >
                    <span>
                      {isOmsPlaceholder &&
                      isOmsChannel &&
                      group.key === "shipping" &&
                      child.key === "shippingActual"
                        ? "ค่าธรรมเนียมและค่าส่งที่ร้านจ่าย"
                        : child.label}
                    </span>
                    <span className="amount">{formatTHB(child.amount)}</span>
                  </div>
                ))}
              </div>
            ))}
            {bill.feeExtraLines.map((line) => (
              <div key={line.key} className="bill-row unknown">
                <span>{line.label}</span>
                <span className="amount">{formatTHB(line.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {bill.adjustment !== 0 ? (
        <section className="bill-section">
          <div className="bill-section-head adjustment">
            <span>จำนวนการปรับยอด</span>
            <span>{formatTHB(bill.adjustment)}</span>
          </div>
        </section>
      ) : null}

      {isOmsChannel && bill.cogsTotal > 0 ? (
        <section className="bill-section">
          <div className="bill-section-head">
            <span>ต้นทุนสินค้า (ตัดสต็อก)</span>
            <span className="amount font-bold text-[#dc2626]">{formatTHB(-bill.cogsTotal)}</span>
          </div>
          <div className="bill-rows">
            {omsItems && omsItems.length === 1 ? (
              (() => {
                const it = omsItems[0]!;
                const qty = it.quantity || 1;
                return (
                  <div className="bill-row child">
                    <span>
                      • <strong className="mono">{it.skuCode}</strong> · {it.productName} × {qty} ชิ้น
                      {qty > 1 ? (
                        <span className="text-[11.5px] text-[#64748b]">
                          {" "}(ต้นทุนเฉลี่ยชิ้นละ {formatTHB(bill.cogsTotal / qty)})
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-[#64748b]">
                          {" "}(ต้นทุน {formatTHB(bill.cogsTotal)})
                        </span>
                      )}
                    </span>
                    <span className="amount font-medium text-[#dc2626]">{formatTHB(-bill.cogsTotal)}</span>
                  </div>
                );
              })()
            ) : omsItems && omsItems.length > 1 ? (
              (() => {
                const totalItemSales = omsItems.reduce(
                  (sum, it) => sum + (it.unitPrice * (it.quantity || 1) || 0),
                  0,
                );
                const totalQty = omsItems.reduce(
                  (sum, it) => sum + (it.quantity || 1),
                  0,
                );

                // Allocate cost pro-rata by price if available, otherwise by quantity
                let runningSum = 0;
                const allocated = omsItems.map((it, idx) => {
                  let cost = 0;
                  if (idx === omsItems.length - 1) {
                    cost = Math.round((bill.cogsTotal - runningSum) * 100) / 100;
                  } else if (totalItemSales > 0) {
                    const itemAmt = it.unitPrice * (it.quantity || 1) || 0;
                    cost =
                      Math.round(
                        (itemAmt / totalItemSales) * bill.cogsTotal * 100,
                      ) / 100;
                    runningSum += cost;
                  } else if (totalQty > 0) {
                    cost =
                      Math.round(
                        ((it.quantity || 1) / totalQty) * bill.cogsTotal * 100,
                      ) / 100;
                    runningSum += cost;
                  }
                  return { it, cost };
                });

                return (
                  <>
                    <div className="bill-row muted text-[11.5px] font-semibold text-[#475569]">
                      <span>แจกแจงต้นทุนสินค้าในออเดอร์นี้ ({totalQty} ชิ้น):</span>
                      <span className="amount font-bold text-[#dc2626]">{formatTHB(-bill.cogsTotal)}</span>
                    </div>
                    {allocated.map(({ it, cost }, idx) => (
                      <div key={`${it.skuCode}-${idx}`} className="bill-row child">
                        <span>
                          • <strong className="mono">{it.skuCode}</strong> · {it.productName} × {it.quantity || 1} ชิ้น
                          <span className="text-[11.5px] text-[#64748b]">
                            {" "}(ต้นทุนประเมิน {formatTHB(cost)})
                          </span>
                        </span>
                        <span className="amount font-medium text-[#dc2626]">{formatTHB(-cost)}</span>
                      </div>
                    ))}
                  </>
                );
              })()
            ) : (
              <div className="bill-row child">
                <span>ต้นทุนสินค้าตัดสต็อกของ Shipnity</span>
                <span className="amount font-bold text-[#dc2626]">{formatTHB(-bill.cogsTotal)}</span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <div className="bill-total">
        <span>
          {isOmsChannel
            ? `กำไรสุทธิ (ตามช่องกำไรในไฟล์ Shipnity · ยอดชำระสุทธิ)`
            : `ยอดการชำระเงินทั้งหมด`}
        </span>
        <span className={bill.payout < 0 ? "amount danger text-[#e11d48]" : ""}>
          {formatTHB(bill.payout)}
        </span>
      </div>

      {!bill.checks.ok ? (
        <div className="bill-alert">
          <IconAlert size={20} />
          <div>
            <strong>ยอดคำนวณไม่ลงตัว</strong>
            <ul>
              {bill.checks.incomeDiff !== 0 ? (
                <li>รายได้ต่างจากรายการย่อย {formatTHB(bill.checks.incomeDiff)}</li>
              ) : null}
              {bill.checks.feeDiff !== 0 ? (
                <li>ค่าธรรมเนียมต่างจากรายการย่อย {formatTHB(bill.checks.feeDiff)}</li>
              ) : null}
              {bill.checks.payoutDiff !== 0 ? (
                <li>ยอดชำระต่างจากการคำนวณ {formatTHB(bill.checks.payoutDiff)}</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {bill.notes.length > 0 ? (
        <ul className="bill-notes">
          {bill.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {extraReferenceLines.length > 0 ? (
        <details className="bill-extra">
          <summary>ข้อมูลอ้างอิงจากไฟล์ · {source.filename}</summary>
          <pre>{extraReferenceLines.join("\n")}</pre>
        </details>
      ) : null}

      <footer className="bill-source">
        <span>
          ที่มา: <strong>{source.filename}</strong> · นำเข้า {formatDateTime(source.importedAt)} ·{" "}
          <Link
            href={`/import/${source.importId}`}
            className="no-print inline-flex min-h-[40px] items-center px-1"
          >
            ดูรายงานการนำเข้า
          </Link>
        </span>
        <span>
          {isOmsChannel
            ? `ตัวเลขทั้งหมดอ้างอิงจากรายละเอียดคำสั่งซื้อ ${channelLabel} ในไฟล์ shipnity`
            : "ตัวเลขทั้งหมดอ้างอิงจากรายละเอียดคำสั่งซื้อที่ export จาก TikTok Shop"}
        </span>
      </footer>
    </article>
  );
}
