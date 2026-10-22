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
  discountTotal,
  shippingFeeCustomer,
  shippingFeeSeller,
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

  const channelLabel =
    channel === "TikTok"
      ? "TikTok Shop"
      : channel === "Shopee"
        ? "Shopee"
        : channel === "Facebook"
          ? "Facebook"
          : channel;

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
              ยอดทั้งหมดอ้างอิงจากไฟล์ export และจับคู่รหัสสินค้าจาก OMS
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
          <dt>ผูกออเดอร์ OMS (ค้นหารายการสินค้า)</dt>
          {orderCode ? (
            <dd className="mono">#{orderCode}</dd>
          ) : (
            <dd className="text-xs font-normal text-muted-foreground">
              (ยังไม่มีข้อมูล — รออัปโหลดไฟล์ออเดอร์ OMS ของวันสั่งซื้อ {formatDate(bill.createdAt)})
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
          <dt>ช่องทางจำหน่าย</dt>
          <dd>{channelLabel}</dd>
        </div>
        <div>
          <dt>เลขที่ใบกำกับภาษี</dt>
          {invoiceNo ? (
            <dd className="mono">{invoiceNo}</dd>
          ) : (
            <dd className="text-xs font-normal text-muted-foreground">
              (ยังไม่มีข้อมูล — รออัปโหลดไฟล์ออเดอร์ OMS ของวันสั่งซื้อ {formatDate(bill.createdAt)})
            </dd>
          )}
        </div>
        <div>
          <dt>ชื่อลูกค้า</dt>
          {customerName ? (
            <dd>{customerName}</dd>
          ) : (
            <dd className="text-xs font-normal text-muted-foreground">
              (ยังไม่มีข้อมูล — ในไฟล์ Settlement ไม่มีชื่อลูกค้า รอผูกไฟล์ออเดอร์ OMS)
            </dd>
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
            <dd className="text-xs font-normal text-muted-foreground">
              (ยังไม่มีข้อมูล — รอผูกไฟล์ออเดอร์ OMS ของวันสั่งซื้อ {formatDate(bill.createdAt)})
            </dd>
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
          <dd>{bill.transactionType}</dd>
        </div>
        <div>
          <dt>สกุลเงิน</dt>
          <dd>{bill.currency}</dd>
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
            รายการสินค้าที่แมปได้ (
            {omsItems && omsItems.length > 0
              ? `${omsItems.length} รายการ`
              : "ยังไม่มีข้อมูลจากไฟล์ OMS"}
            )
          </span>
          <span>
            {omsItems && omsItems.length > 0
              ? `${omsItems.reduce((acc, it) => acc + it.quantity, 0)} ชิ้น`
              : `(รอไฟล์ OMS วันสั่งซื้อ ${formatDate(bill.createdAt)})`}
          </span>
        </div>
        <div className="bill-rows">
          {omsItems && omsItems.length > 0 ? (
            <>
              {omsItems.map((it, idx) => (
                <div key={`${it.skuCode}-${idx}`} className="bill-row">
                  <span>
                    <strong className="mono">{it.skuCode}</strong> · {it.productName} ×{" "}
                    {it.quantity}{" "}
                    <span className="text-xs text-muted-foreground">
                      (ราคาตั้งต้น {formatTHB(it.unitPrice)}/ชิ้น)
                    </span>
                  </span>
                  <span className="amount">
                    {formatTHB(it.unitPrice * it.quantity)}
                  </span>
                </div>
              ))}
              {(() => {
                const listTotal = omsItems.reduce(
                  (acc, it) => acc + it.unitPrice * it.quantity,
                  0,
                );
                const effectiveDiscount =
                  discountTotal !== undefined && discountTotal > 0
                    ? discountTotal
                    : Math.max(0, listTotal - bill.incomeTotal);
                const breakdown = bill.discountBreakdown ?? [];
                return (
                  <>
                    <div className="bill-row child">
                      <span>ยอดรวมราคาตั้งต้นสินค้า ({omsItems.length} รายการ)</span>
                      <span className="amount">{formatTHB(listTotal)}</span>
                    </div>
                    {breakdown.length > 0 ? (
                      breakdown.map((d) => (
                        <div key={`oms-disc-${d.key}`} className="bill-row child">
                          <span>
                            {d.label}
                            {d.key === "storeDiscount" && discountCode
                              ? ` (โค้ด: ${discountCode})`
                              : ""}
                          </span>
                          <span className={`amount${d.amount < 0 ? " danger" : ""}`}>
                            {formatTHB(d.amount)}
                          </span>
                        </div>
                      ))
                    ) : effectiveDiscount > 0 ? (
                      <div className="bill-row child">
                        <span>
                          หักส่วนลดร้านค้า / โปรโมชั่นแคมเปญ
                          {discountCode
                            ? ` (โค้ดส่วนลด: ${discountCode})`
                            : " (ไฟล์ออเดอร์ OMS เก็บเป็นยอดส่วนลดรวม ไม่ได้แยกรายชิ้น)"}
                        </span>
                        <span className="amount danger">
                          -{formatTHB(effectiveDiscount)}
                        </span>
                      </div>
                    ) : null}
                    {shippingFeeCustomer !== undefined && shippingFeeCustomer > 0 ? (
                      <div className="bill-row child">
                        <span>ค่าจัดส่งที่เก็บจากลูกค้า (จากไฟล์ออเดอร์ OMS)</span>
                        <span className="amount">+{formatTHB(shippingFeeCustomer)}</span>
                      </div>
                    ) : null}
                    {shippingFeeSeller !== undefined && shippingFeeSeller > 0 ? (
                      <div className="bill-row child">
                        <span>ค่าจัดส่งที่ร้านค้าจ่ายจริง (จากไฟล์ออเดอร์ OMS)</span>
                        <span className="amount danger">-{formatTHB(shippingFeeSeller)}</span>
                      </div>
                    ) : null}
                    <div className="bill-row font-bold">
                      <span>ยอดขายสุทธิหลังหักส่วนลด (ตรงกับรายได้รวม)</span>
                      <span className="amount">{formatTHB(bill.incomeTotal)}</span>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {productDetail && productDetail !== "/" ? (
                <div className="bill-row">
                  <span>
                    รหัสสินค้าจาก {channelLabel}:{" "}
                    <strong className="mono">
                      {productDetail.replace(/;\s*$/, "")}
                    </strong>{" "}
                    <span className="text-xs text-muted-foreground">
                      (รหัสแพลตฟอร์มจากไฟล์ Settlement — ยังไม่มีชื่อสินค้า)
                    </span>
                  </span>
                  <span className="amount">{formatTHB(bill.incomeTotal)}</span>
                </div>
              ) : null}
              <div className="bill-row muted">
                <span>
                  {orderCode
                    ? `(ผูกกับออเดอร์ #${orderCode} แล้ว แต่ยังไม่มีรายละเอียดสินค้า — กรุณาอัปโหลดไฟล์รายการสินค้า OMS ที่ครอบคลุมออเดอร์ #${orderCode} เพื่อดึงชื่อสินค้า รหัส SKU และราคาตั้งต้นต่อชิ้นมาแสดง)`
                    : `(ยังไม่มีข้อมูลรายการสินค้าและส่วนลดตั้งต้น — เนื่องจากคำสั่งซื้อนี้สั่งซื้อเมื่อวันที่ ${formatDate(
                        bill.createdAt,
                      )} กรุณาอัปโหลดไฟล์ออเดอร์และไฟล์รายการสินค้า OMS ของวันที่สั่งซื้อดังกล่าว เพื่อให้ระบบผูก #OF และดึงชื่อสินค้ามาแสดงครบถ้วน)`}
                </span>
                <span className="amount text-xs text-muted-foreground">
                  (รอไฟล์ OMS)
                </span>
              </div>
              {bill.discountBreakdown && bill.discountBreakdown.length > 0 ? (
                <>
                  {bill.discountBreakdown.map((d) => (
                    <div key={`settle-disc-${d.key}`} className="bill-row child">
                      <span>{d.label} (จากไฟล์ Settlement)</span>
                      <span className={`amount${d.amount < 0 ? " danger" : ""}`}>
                        {formatTHB(d.amount)}
                      </span>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="bill-section">
        <div className="bill-section-head">
          <span>รายได้รวม</span>
          <span>{formatTHB(bill.incomeTotal)}</span>
        </div>
        <div className="bill-rows">
          {bill.incomeLines.map((line) => (
            <div
              key={line.key}
              className={`bill-row${line.depth === 1 ? " child" : ""}${
                line.kind === "unknown" ? " unknown" : ""
              }`}
            >
              <span>{line.label}</span>
              <span className="amount">{formatTHB(line.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bill-section">
        <div className="bill-section-head fee">
          <span>ค่าธรรมเนียมทั้งหมด (ค่าคอมมิชชั่น / ค่าส่ง / ค่าบริการที่แพลตฟอร์มหัก)</span>
          <span>{formatTHB(bill.feeTotal)}</span>
        </div>
        <div className="bill-rows">
          {!hasFees ? (
            <div className="bill-row muted">
              <span>
                {isOmsPlaceholder
                  ? `(ยังไม่มีข้อมูลค่าธรรมเนียมที่ ${channelLabel} หัก — บิลนี้เพิ่งนำเข้าจากไฟล์ออเดอร์ OMS เท่านั้น กรุณาอัปโหลดไฟล์ Settlement รายได้ของรอบโอนเงินคำสั่งซื้อนี้ ระบบจึงจะดึงค่าขนส่ง ค่าคอมมิชชั่น และค่าบริการที่ถูกหักมาแจกแจงให้ครบทุกบรรทัด)`
                  : "(ไม่มีค่าธรรมเนียมที่ถูกหักในคำสั่งซื้อนี้)"}
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
                <div key={`${group.key}-${child.key}`} className="bill-row child">
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
            <span>รายการปรับปรุง</span>
            <span>{formatTHB(bill.adjustment)}</span>
          </div>
          <div className="bill-rows">
            <div className="bill-row">
              <span>จำนวนการปรับยอด</span>
              <span className="amount">{formatTHB(bill.adjustment)}</span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="bill-total">
        <span>จำนวนเงินที่ชำระทั้งหมด</span>
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

      {bill.productDetail ? (
        <details className="bill-extra">
          <summary>ข้อมูลอ้างอิงจากไฟล์</summary>
          <pre>{bill.productDetail}</pre>
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
        <span>ตัวเลขทั้งหมดอ้างอิงจากรายละเอียดคำสั่งซื้อที่ export จาก TikTok Shop</span>
      </footer>
    </article>
  );
}
