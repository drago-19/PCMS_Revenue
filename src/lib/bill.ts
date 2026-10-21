import { FEE_GROUPS, FIELD_BY_KEY } from "./ingest/catalog";
import type { IngestWarning, NormalizedTransaction } from "./ingest/parse";
import { round2 } from "./format";

export interface BillLine {
  key: string;
  label: string;
  amount: number;
  depth: 0 | 1;
  kind: "line" | "unknown";
}

export interface BillFeeGroup {
  key: string;
  label: string;
  amount: number;
  children: BillLine[];
}

export interface BillModel {
  externalId: string;
  transactionType: string;
  createdAt: string;
  paidAt: string;
  currency: string;
  incomeTotal: number;
  incomeLines: BillLine[];
  feeTotal: number;
  feeGroups: BillFeeGroup[];
  feeExtraLines: BillLine[];
  adjustment: number;
  payout: number;
  checks: {
    incomeDiff: number;
    feeDiff: number;
    payoutDiff: number;
    ok: boolean;
  };
  unknownMoneyColumns: { header: string; amount: number }[];
  warnings: IngestWarning[];
  notes: string[];
  productDetail: string | null;
  weightEstimated: number | null;
  sourceRows: number;
}

function n(value: string | number | undefined): number {
  if (typeof value === "number") return round2(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? round2(parsed) : 0;
  }
  return 0;
}

function labelFor(key: string): string {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

export function buildBill(normalized: NormalizedTransaction): BillModel {
  const fields = normalized.fields;
  const incomeTotal = n(fields.incomeTotal);
  const feeTotal = n(fields.feeTotal);
  const payout = n(fields.payout);
  const adjustment = n(fields.adjustment);

  const incomeLines: BillLine[] = [];
  const productAfter = n(fields.productAfterDiscount);
  const productBefore = n(fields.productBeforeDiscount);
  const storeDiscount = n(fields.storeDiscount);
  const refundAfter = n(fields.refundAfterDiscount);
  const refundBefore = n(fields.refundBeforeDiscount);
  const refundStoreDiscount = n(fields.refundStoreDiscount);

  if (productAfter !== 0 || productBefore !== 0 || storeDiscount !== 0) {
    incomeLines.push({
      key: "productAfterDiscount",
      label: labelFor("productAfterDiscount"),
      amount: productAfter,
      depth: 0,
      kind: "line",
    });
    if (productBefore !== 0) {
      incomeLines.push({
        key: "productBeforeDiscount",
        label: labelFor("productBeforeDiscount"),
        amount: productBefore,
        depth: 1,
        kind: "line",
      });
    }
    if (storeDiscount !== 0) {
      incomeLines.push({
        key: "storeDiscount",
        label: labelFor("storeDiscount"),
        amount: storeDiscount,
        depth: 1,
        kind: "line",
      });
    }
  }

  if (refundAfter !== 0 || refundBefore !== 0 || refundStoreDiscount !== 0) {
    incomeLines.push({
      key: "refundAfterDiscount",
      label: labelFor("refundAfterDiscount"),
      amount: refundAfter,
      depth: 0,
      kind: "line",
    });
    if (refundBefore !== 0) {
      incomeLines.push({
        key: "refundBeforeDiscount",
        label: labelFor("refundBeforeDiscount"),
        amount: refundBefore,
        depth: 1,
        kind: "line",
      });
    }
    if (refundStoreDiscount !== 0) {
      incomeLines.push({
        key: "refundStoreDiscount",
        label: labelFor("refundStoreDiscount"),
        amount: refundStoreDiscount,
        depth: 1,
        kind: "line",
      });
    }
  }

  if (normalized.checks.incomeDiff !== 0) {
    incomeLines.push({
      key: "incomeDiff",
      label: "รายได้อื่น ๆ ที่ยังไม่จัดกลุ่ม",
      amount: normalized.checks.incomeDiff,
      depth: 0,
      kind: "unknown",
    });
  }

  if (incomeLines.length === 0) {
    incomeLines.push({
      key: "incomeTotal",
      label: "รายได้รวม",
      amount: incomeTotal,
      depth: 0,
      kind: "line",
    });
  }

  const feeGroups: BillFeeGroup[] = [];
  for (const group of FEE_GROUPS) {
    const value = normalized.feeGroups[group.key];
    if (!value) continue;
    const children: BillLine[] = [];
    for (const childKey of group.children) {
      const amount = round2(value.children[childKey] ?? 0);
      if (amount === 0) continue;
      const label = labelFor(childKey);
      if (label === group.label) continue;
      children.push({
        key: childKey,
        label,
        amount,
        depth: 1,
        kind: "line",
      });
    }
    if (value.total === 0 && children.length === 0) continue;
    feeGroups.push({
      key: group.key,
      label: group.label,
      amount: round2(value.total),
      children,
    });
  }

  const feeExtraLines: BillLine[] = [];
  if (normalized.checks.feeDiff !== 0) {
    feeExtraLines.push({
      key: "feeDiff",
      label: "ค่าธรรมเนียม/รายการอื่นที่ยังไม่จัดกลุ่ม",
      amount: normalized.checks.feeDiff,
      depth: 0,
      kind: "unknown",
    });
  }
  if (normalized.checks.payoutDiff !== 0) {
    feeExtraLines.push({
      key: "payoutDiff",
      label: "รายการปรับปรุงที่ยังไม่จัดกลุ่ม",
      amount: normalized.checks.payoutDiff,
      depth: 0,
      kind: "unknown",
    });
  }

  const unknownMoneyColumns = normalized.unknownValues
    .filter((value) => value.moneyLike && value.amount !== 0)
    .map((value) => ({ header: value.header, amount: value.amount }));

  const notes: string[] = [];
  if (normalized.sourceRows > 1) {
    notes.push(`รวม ${normalized.sourceRows} แถวของคำสั่งซื้อนี้ออกเป็นบิลเดียว`);
  }
  if (!normalized.paidAt) {
    notes.push("ไม่พบวันที่ชำระเงินในไฟล์ export");
  }
  if (unknownMoneyColumns.length > 0) {
    notes.push(
      `พบคอลัมน์ตัวเลขใหม่: ${unknownMoneyColumns
        .map((value) => `${value.header} (${value.amount})`)
        .join(", ")}`,
    );
  }

  const checksOk =
    Math.abs(normalized.checks.incomeDiff) < 0.01 &&
    Math.abs(normalized.checks.feeDiff) < 0.01 &&
    Math.abs(normalized.checks.payoutDiff) < 0.01 &&
    Math.abs(round2(incomeTotal + feeTotal + adjustment) - payout) < 0.01;

  return {
    externalId: normalized.externalId,
    transactionType: normalized.transactionType,
    createdAt: normalized.createdAt,
    paidAt: normalized.paidAt,
    currency: normalized.currency || "THB",
    incomeTotal,
    incomeLines,
    feeTotal,
    feeGroups,
    feeExtraLines,
    adjustment,
    payout,
    checks: {
      incomeDiff: normalized.checks.incomeDiff,
      feeDiff: normalized.checks.feeDiff,
      payoutDiff: normalized.checks.payoutDiff,
      ok: checksOk,
    },
    unknownMoneyColumns,
    warnings: normalized.warnings,
    notes,
    productDetail:
      typeof normalized.fields.productDetail === "string"
        ? normalized.fields.productDetail
        : null,
    weightEstimated:
      typeof normalized.fields.weightEstimated === "number"
        ? normalized.fields.weightEstimated
        : null,
    sourceRows: normalized.sourceRows,
  };
}
