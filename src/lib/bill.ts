import { FEE_GROUPS, FIELD_BY_KEY } from "./ingest/catalog";
import type { IngestWarning, NormalizedTransaction } from "./ingest/parse";
import { round2 } from "./format";

export interface BillLine {
  key: string;
  label: string;
  amount: number;
  depth: 0 | 1 | 2;
  kind: "line" | "unknown";
}

export interface BillFeeGroup {
  key: string;
  label: string;
  amount: number;
  children: BillLine[];
}

export interface CustomerPaymentBreakdown {
  productSubtotalAfterDiscount: number;
  productSubtotalBeforeDiscount: number;
  sellerProductDiscount: number;
  tiktokProductDiscount: number;
  shippingAfterDiscount: number;
  shippingBeforeDiscount: number;
  sellerShippingDiscount: number;
  tiktokShippingDiscount: number;
  total: number;
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
  weightCharged: number | null;
  sourceRows: number;
  rowIndexes?: number[];
  discountBreakdown: BillLine[];
  customerPayment: number;
  shippingCustomerFee: number;
  customerPaymentBreakdown: CustomerPaymentBreakdown;
  cogsTotal: number;
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
  const cogsTotal = n(fields.cogs);

  const incomeLines: BillLine[] = [];
  const productAfter = n(fields.productAfterDiscount);
  const productBefore = n(fields.productBeforeDiscount);
  const storeDiscount = n(fields.storeDiscount);
  const sellerCofund = n(fields.sellerCofundCoupon);
  const shippingDiscountStore = n(fields.shippingDiscountStore);
  const platformDiscount = n(fields.platformDiscount);
  const platformCofund = n(fields.platformCofundCoupon);
  const customerPayment = n(fields.customerPayment);
  const shippingCustomerFee = n(fields.shippingCustomerFee);
  const shippingPlatformDiscount = n(fields.shippingPlatformDiscount);
  const shippingActual = n(fields.shippingActual);
  const shippingSubsidy = n(fields.shippingSubsidy);
  const refundAfter = n(fields.refundAfterDiscount);
  const refundBefore = n(fields.refundBeforeDiscount);
  const refundStoreDiscount = n(fields.refundStoreDiscount);

  const weightEstimated =
    typeof normalized.fields.weightEstimated === "number" &&
    normalized.fields.weightEstimated > 0
      ? normalized.fields.weightEstimated
      : null;
  const weightCharged =
    typeof normalized.fields.weightCharged === "number" &&
    normalized.fields.weightCharged > 0
      ? normalized.fields.weightCharged
      : null;

  const shippingAfterDiscount = round2(Math.max(0, shippingCustomerFee));
  const shippingBeforeDiscount =
    round2(
      shippingAfterDiscount +
        Math.abs(shippingPlatformDiscount) +
        Math.abs(shippingDiscountStore),
    ) > 0
      ? round2(
          shippingAfterDiscount +
            Math.abs(shippingPlatformDiscount) +
            Math.abs(shippingDiscountStore),
        )
      : round2(Math.abs(shippingActual));

  const sellerProductDiscount = -round2(
    Math.abs(storeDiscount) + Math.abs(sellerCofund),
  );
  const tiktokProductDiscount = -round2(
    Math.abs(platformDiscount) + Math.abs(platformCofund),
  );
  const productSubtotalBeforeDiscount =
    productBefore > 0 ? productBefore : productAfter;
  const productSubtotalAfterDiscount =
    customerPayment > 0
      ? round2(Math.max(0, customerPayment - shippingAfterDiscount))
      : round2(
          Math.max(
            0,
            productAfter - Math.abs(tiktokProductDiscount),
          ),
        );

  const customerPaymentBreakdown: CustomerPaymentBreakdown = {
    productSubtotalAfterDiscount,
    productSubtotalBeforeDiscount,
    sellerProductDiscount,
    tiktokProductDiscount,
    shippingAfterDiscount,
    shippingBeforeDiscount,
    sellerShippingDiscount: -round2(Math.abs(shippingDiscountStore)),
    tiktokShippingDiscount: -round2(Math.abs(shippingPlatformDiscount)),
    total:
      customerPayment > 0
        ? customerPayment
        : round2(productSubtotalAfterDiscount + shippingAfterDiscount),
  };

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
    if (sellerCofund !== 0) {
      incomeLines.push({
        key: "sellerCofundCoupon",
        label: labelFor("sellerCofundCoupon"),
        amount: sellerCofund,
        depth: 1,
        kind: "line",
      });
    }
    if (shippingDiscountStore !== 0) {
      incomeLines.push({
        key: "shippingDiscountStore",
        label: labelFor("shippingDiscountStore"),
        amount: shippingDiscountStore,
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

  for (const uv of normalized.unknownValues ?? []) {
    if (uv.category === "income" && uv.amount !== 0) {
      incomeLines.push({
        key: `custom_income_${uv.header}`,
        label: uv.header,
        amount: round2(uv.amount),
        depth: 0,
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
      label: "รายได้ทั้งหมด",
      amount: incomeTotal,
      depth: 0,
      kind: "line",
    });
  }

  const feeGroups: BillFeeGroup[] = [];
  for (const group of FEE_GROUPS) {
    const value = normalized.feeGroups?.[group.key];
    if (!value) continue;
    const childrenMap = value.children ?? {};
    const children: BillLine[] = [];
    for (const childKey of group.children) {
      const amount = round2(childrenMap[childKey] ?? 0);
      if (amount === 0) continue;
      let label = labelFor(childKey);
      if (label === group.label) continue;
      if (
        group.key === "shipping" &&
        childKey === "shippingActual" &&
        weightCharged !== null
      ) {
        label = `${label} (น้ำหนักที่เรียกเก็บเงิน: ${weightCharged} ก.)`;
      }
      children.push({
        key: childKey,
        label,
        amount,
        depth: 1,
        kind: "line",
      });
    }
    const groupTotal = round2(value.total ?? 0);
    if (groupTotal === 0 && children.length === 0) continue;
    feeGroups.push({
      key: group.key,
      label: group.label,
      amount: groupTotal,
      children,
    });
  }

  for (const uv of normalized.unknownValues ?? []) {
    if (uv.category === "fee" && uv.amount !== 0) {
      feeGroups.push({
        key: `custom_fee_${uv.header}`,
        label: uv.header,
        amount: round2(uv.amount),
        children: [],
      });
    }
  }

  const feeExtraLines: BillLine[] = [];
  for (const uv of normalized.unknownValues ?? []) {
    if (uv.category === "adjustment" && uv.amount !== 0) {
      feeExtraLines.push({
        key: `custom_adj_${uv.header}`,
        label: `${uv.header} (รายการปรับปรุง)`,
        amount: round2(uv.amount),
        depth: 0,
        kind: "line",
      });
    }
  }
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

  const unknownMoneyColumns = (normalized.unknownValues ?? [])
    .filter((value) => value.moneyLike && value.amount !== 0 && !value.category)
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

  const isOmsChannel =
    normalized.transactionType === "คำสั่งซื้อ (OMS)" ||
    normalized.raw["ช่องทางติดต่อ"] === "Shopee" ||
    normalized.raw["ช่องทางติดต่อ"] === "Facebook";

  const directCashDiff = round2(incomeTotal + feeTotal + adjustment - payout);
  const cogsAdjustedDiff = round2(
    incomeTotal + feeTotal - cogsTotal + adjustment - payout,
  );
  const effectivePayoutDiff = isOmsChannel
    ? Math.abs(directCashDiff) < 0.01
      ? directCashDiff
      : cogsTotal > 0 && Math.abs(cogsAdjustedDiff) < 0.01
        ? cogsAdjustedDiff
        : directCashDiff
    : normalized.checks.payoutDiff;

  const checksOk =
    Math.abs(normalized.checks.incomeDiff) < 0.01 &&
    Math.abs(normalized.checks.feeDiff) < 0.01 &&
    Math.abs(effectivePayoutDiff) < 0.01;

  const discountBreakdown: BillLine[] = [];
  if (sellerProductDiscount !== 0) {
    discountBreakdown.push({
      key: "storeDiscount",
      label: "ส่วนลดค่าสินค้าจากผู้ขาย",
      amount: sellerProductDiscount,
      depth: 1,
      kind: "line",
    });
  }
  if (tiktokProductDiscount !== 0) {
    discountBreakdown.push({
      key: "platformDiscount",
      label: "ส่วนลดสำหรับสินค้าจาก TikTok Shop",
      amount: tiktokProductDiscount,
      depth: 1,
      kind: "line",
    });
  }
  if (shippingDiscountStore !== 0) {
    discountBreakdown.push({
      key: "shippingDiscountStore",
      label: "ส่วนลดค่าจัดส่งจากผู้ขาย",
      amount: -round2(Math.abs(shippingDiscountStore)),
      depth: 1,
      kind: "line",
    });
  }
  for (const key of [
    "customerRefund",
    "sellerCofundCouponRefund",
    "platformDiscountRefund",
    "platformCofundCouponRefund",
  ]) {
    const val = n(fields[key]);
    if (val !== 0) {
      discountBreakdown.push({
        key,
        label: labelFor(key),
        amount: val,
        depth: 1,
        kind: "line",
      });
    }
  }

  const rawProductDetail =
    typeof normalized.fields.productDetail === "string"
      ? normalized.fields.productDetail.trim()
      : "";
  const cleanProductDetail =
    rawProductDetail && !["/", "-", "--", "N/A"].includes(rawProductDetail)
      ? rawProductDetail
      : null;
  const rowIndexes =
    Array.isArray(normalized.rowIndexes) && normalized.rowIndexes.length > 0
      ? normalized.rowIndexes
      : typeof normalized.firstRow === "number" && normalized.firstRow > 0
        ? [normalized.firstRow]
        : [];

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
    cogsTotal,
    checks: {
      incomeDiff: normalized.checks.incomeDiff,
      feeDiff: normalized.checks.feeDiff,
      payoutDiff: effectivePayoutDiff,
      ok: checksOk,
    },
    unknownMoneyColumns,
    warnings: normalized.warnings,
    notes,
    productDetail: cleanProductDetail,
    weightEstimated,
    weightCharged,
    sourceRows: normalized.sourceRows,
    rowIndexes,
    discountBreakdown,
    customerPayment,
    shippingCustomerFee,
    customerPaymentBreakdown,
  };
}

export interface RowShippingSummary {
  positiveAmount: number;
  negativeAmount: number;
  netAmount: number;
}

export function getRowShippingSummary(row: {
  channel?: string | null;
  transactionType?: string | null;
  shippingFeeCustomer?: number;
  normalized: NormalizedTransaction;
}): RowShippingSummary {
  const ch = row.channel || "TikTok";
  const isOmsChannel = ch === "Shopee" || ch === "Facebook";
  const fields = row.normalized?.fields ?? {};

  if (isOmsChannel) {
    const custShip = round2(
      Math.max(
        0,
        Number(row.shippingFeeCustomer ?? fields.shippingCustomerFee ?? 0),
      ),
    );
    return {
      positiveAmount: custShip,
      negativeAmount: 0,
      netAmount: custShip,
    };
  }

  const isOmsOnly = row.transactionType === "คำสั่งซื้อ (OMS)";
  let positiveAmount = 0;
  let negativeAmount = 0;

  const custShip = Number(
    fields.shippingCustomerFee ?? row.shippingFeeCustomer ?? 0,
  );
  if (custShip > 0) positiveAmount = round2(positiveAmount + custShip);
  else if (custShip < 0) negativeAmount = round2(negativeAmount + custShip);

  for (const key of [
    "shippingPlatformDiscount",
    "shippingSubsidy",
    "guaranteeReimbursement",
    "exchangeShipping",
    "replacementShipping",
    "shippingRefund",
  ]) {
    const val = n(fields[key]);
    if (val > 0) positiveAmount = round2(positiveAmount + val);
    else if (val < 0) negativeAmount = round2(negativeAmount + val);
  }

  if (!isOmsOnly) {
    for (const key of ["shippingActual", "returnShippingActual"]) {
      const val = n(fields[key]);
      if (val > 0) positiveAmount = round2(positiveAmount + val);
      else if (val < 0) negativeAmount = round2(negativeAmount + val);
    }
  }

  return {
    positiveAmount: round2(positiveAmount),
    negativeAmount: round2(negativeAmount),
    netAmount: round2(positiveAmount + negativeAmount),
  };
}

