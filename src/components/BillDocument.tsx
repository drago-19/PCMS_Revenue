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
}) {
  const isOmsPlaceholder = bill.transactionType === "คำสั่งซื้อ (OMS)";
  const hasFees =
    bill.feeGroups.length > 0 ||
    bill.feeExtraLines.length > 0 ||
    bill.feeTotal !== 0;

  const isShopee = channel === "Shopee";
  const channelLabel = isShopee ? "Shopee" : "TikTok Shop";
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
            {bill.externalId}
            <CopyButton value={bill.externalId} />
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
          {invoiceNo ? (
            <dd className="mono">{invoiceNo}</dd>
          ) : !isOmsPlaceholder && bill.incomeTotal <= 0 && bill.payout <= 0 ? (
            <dd className="bill-empty-hint">ไม่ออกใบกำกับภาษี (ยอดสุทธิ 0 บาท)</dd>
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
      </dl>

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
                  ? isShopee
                    ? "คำสั่งซื้อจาก Shopee (ออเดอร์ใน shipnity)"
                    : "ยังไม่มีข้อมูลรายได้จาก TikTok"
                  : "ไม่มีค่าธรรมเนียมที่ถูกหักในคำสั่งซื้อนี้"}
              </span>
              <span className="amount">{formatTHB(0)}</span>
            </div>
          ) : null}
          {bill.feeGroups.map((group) => (
            <div key={group.key} className="bill-group">
              <div className="bill-row group">
                <span>{group.label}</span>
                <span className="amount">{formatTHB(group.amount)}</span>
              </div>
              {group.children.map((child) => (
                <div
                  key={`${group.key}-${child.key}`}
                  className={`bill-row child${
                    child.depth === 2 ? " pl-7 text-[12px] text-[#475569]" : ""
                  }`}
                >
                  <span>{child.label}</span>
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

      {bill.adjustment !== 0 ? (
        <section className="bill-section">
          <div className="bill-section-head adjustment">
            <span>จำนวนการปรับยอด</span>
            <span>{formatTHB(bill.adjustment)}</span>
          </div>
        </section>
      ) : null}

      <div className="bill-total">
        <span>ยอดการชำระเงินทั้งหมด</span>
        <span>{formatTHB(bill.payout)}</span>
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
          {isShopee
            ? "ตัวเลขทั้งหมดอ้างอิงจากรายละเอียดคำสั่งซื้อ Shopee ในไฟล์ shipnity"
            : "ตัวเลขทั้งหมดอ้างอิงจากรายละเอียดคำสั่งซื้อที่ export จาก TikTok Shop"}
        </span>
      </footer>
    </article>
  );
}
