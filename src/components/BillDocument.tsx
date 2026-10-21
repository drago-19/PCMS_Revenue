import Link from "next/link";
import type { BillModel } from "@/lib/bill";
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
}: {
  bill: BillModel;
  source: { filename: string; importedAt: string; importId: number };
  invoiceNo?: string | null;
}) {
  const hasFees =
    bill.feeGroups.length > 0 ||
    bill.feeExtraLines.length > 0 ||
    bill.feeTotal !== 0;

  return (
    <article className="bill-card">
      <header className="bill-card-head">
        <div>
          <p className="bill-kicker">TikTok Shop · รายละเอียดรายได้</p>
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
              ยอดทั้งหมดอ้างอิงจากไฟล์ export ของ TikTok Shop
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <dl className="bill-meta">
        <div>
          <dt>หมายเลขคำสั่งซื้อ</dt>
          <dd className="mono">
            {bill.externalId}
            <CopyButton value={bill.externalId} />
          </dd>
        </div>
        {invoiceNo ? (
          <div>
            <dt>เลขที่ใบกำกับภาษี</dt>
            <dd className="mono">{invoiceNo}</dd>
          </div>
        ) : null}
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
          <span>ค่าธรรมเนียมทั้งหมด</span>
          <span>{formatTHB(bill.feeTotal)}</span>
        </div>
        <div className="bill-rows">
          {!hasFees ? (
            <div className="bill-row muted">
              <span>ไม่มีค่าธรรมเนียมในคำสั่งซื้อนี้</span>
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
