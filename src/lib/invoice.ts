import {
  formatInvoiceNoWithPrefix,
  formatReceiptNoWithPrefix,
  SELLER,
  type SellerInfo,
} from "./seller";
import { bahtText, round2 } from "./format";
import type { TransactionRow } from "./queries";

export interface InvoiceItem {
  sku: string;
  name?: string;
  unitPrice?: number;
  qty: number;
  lineTotal?: number;
}

export interface InvoiceCustomer {
  name: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  province: string | null;
  taxId?: string | null;
}

export interface InvoiceModel {
  invoiceNo: string | null;
  receiptNo: string;
  orderId: string;
  orderCode: string | null;
  channel: string;
  trackingNo: string | null;
  courier: string | null;
  issuedAt: string;
  createdDate: string;
  paidDate: string;
  seller: SellerInfo;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  grossItemsTotal: number;
  discountTotal: number;
  discountCode: string | null;
  storeDiscount: number;
  platformCoupon: number;
  platformDiscount?: number;
  platformCofundCoupon?: number;
  sellerCofundCoupon?: number;
  platformDiscountRefund?: number;
  platformCofundCouponRefund?: number;
  sellerCofundCouponRefund?: number;
  salesAmount: number;
  shippingFee: number;
  shippingCustomerFee?: number;
  shippingGross: number;
  shippingCoupon: number;
  shippingPlatformDiscount: number;
  shippingDiscountStore?: number;
  shippingSubsidy?: number;
  guaranteeReimbursement?: number;
  exchangeShipping?: number;
  replacementShipping?: number;
  shippingActual: number;
  returnShippingActual?: number;
  shippingRefund?: number;
  extraBreakdownLines?: { key: string; label: string; amount: number }[];
  weightEstimated: number | null;
  weightCharged: number | null;
  customerPayment: number;
  customerTotal: number;
  feeTotal: number;
  adjustment: number;
  payout: number;
  receiptSubtotal: number;
  receiptCoupon: number;
  receiptTotal: number;
  receiptPreVatAmount: number;
  receiptVatAmount: number;
  receiptTotalText: string;
  preVatAmount: number;
  vatAmount: number;
  total: number;
  totalText: string;
}

export function parseProductItems(detail: string | null): InvoiceItem[] {
  if (!detail || detail === "/") return [];
  const items: InvoiceItem[] = [];
  for (const part of detail.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const omsMatch = /^([^\s·]+)\s*·\s*(.+?)\s*×\s*(\d+)$/.exec(trimmed);
    if (omsMatch) {
      items.push({
        sku: omsMatch[1],
        name: omsMatch[2],
        qty: Number(omsMatch[3]),
      });
      continue;
    }
    const match = /^(\d+)\s*\*\s*(\d+)$/.exec(trimmed);
    if (match) {
      items.push({ sku: match[1], qty: Number(match[2]) });
    } else {
      items.push({ sku: trimmed, qty: 1 });
    }
  }
  return items;
}

export function buildInvoice(
  row: TransactionRow,
  sellerOverride?: SellerInfo,
): InvoiceModel {
  const activeSeller: SellerInfo = {
    ...SELLER,
    ...(row.sellerSettings ?? {}),
    ...(sellerOverride ?? {}),
  };
  const fields = row.normalized.fields;
  const rawIncome = Number(fields.incomeTotal ?? row.income ?? 0);
  const rawPayout = Number(fields.payout ?? row.payout ?? 0);
  const rawRefundAfter = Number(fields.refundAfterDiscount ?? 0);
  const isZeroRefundedOrder =
    row.transactionType !== "คำสั่งซื้อ (OMS)" &&
    rawIncome <= 0 &&
    rawPayout <= 0 &&
    (rawRefundAfter < 0 || Number(fields.productAfterDiscount ?? 0) <= 0);

  const salesAmount = isZeroRefundedOrder
    ? 0
    : round2(Number(fields.productAfterDiscount ?? row.income ?? 0));
  const shippingFee = round2(
    Number(row.shippingFeeCustomer ?? fields.shippingCustomerFee ?? 0),
  );

  let items: InvoiceItem[] = [];
  if (row.omsItems && row.omsItems.length > 0) {
    items = row.omsItems.map((it) => ({
      sku: it.skuCode,
      name: it.productName,
      unitPrice: round2(it.unitPrice),
      qty: it.quantity,
      lineTotal: round2(it.unitPrice * it.quantity),
    }));
  } else {
    items = parseProductItems(row.productDetail);
  }

  const productBeforeFromFields = round2(
    Number(fields.productBeforeDiscount ?? 0),
  );

  const grossItemsTotal =
    items.length > 0 && items.some((i) => i.lineTotal !== undefined)
      ? round2(items.reduce((acc, i) => acc + (i.lineTotal ?? 0), 0))
      : productBeforeFromFields > salesAmount
        ? productBeforeFromFields
        : salesAmount;

  const storeDiscountFromFields = round2(
    Math.abs(Number(fields.storeDiscount ?? 0)) +
      Math.abs(Number(fields.sellerCofundCoupon ?? 0)),
  );

  const explicitDiscount =
    row.discountTotal !== undefined
      ? round2(Math.abs(row.discountTotal))
      : storeDiscountFromFields;

  const derivedDiscount =
    grossItemsTotal > salesAmount
      ? round2(grossItemsTotal - salesAmount)
      : explicitDiscount;

  const platformCoupon = round2(
    Math.abs(Number(fields.platformDiscount ?? 0)) +
      Math.abs(Number(fields.platformCofundCoupon ?? 0)),
  );

  // ดึงค่าจริงและเครื่องหมายจริงจากไฟล์ที่นำเข้าโดยตรง (ห้ามใช้ Math.abs กลับเครื่องหมายหรือคำนวณยอดใหม่เอง)
  const platformDiscount = round2(Number(fields.platformDiscount ?? 0));
  const platformCofundCoupon = round2(
    Number(fields.platformCofundCoupon ?? 0),
  );
  const sellerCofundCoupon = round2(Number(fields.sellerCofundCoupon ?? 0));
  const platformDiscountRefund = round2(
    Number(fields.platformDiscountRefund ?? 0),
  );
  const platformCofundCouponRefund = round2(
    Number(fields.platformCofundCouponRefund ?? 0),
  );
  const sellerCofundCouponRefund = round2(
    Number(fields.sellerCofundCouponRefund ?? 0),
  );

  const shippingCustomerFee = round2(Number(fields.shippingCustomerFee ?? 0));
  const shippingPlatformDiscount = round2(
    Number(fields.shippingPlatformDiscount ?? 0),
  );
  const shippingDiscountStore = round2(
    Number(fields.shippingDiscountStore ?? 0),
  );
  const shippingSubsidy = round2(Number(fields.shippingSubsidy ?? 0));
  const guaranteeReimbursement = round2(
    Number(fields.guaranteeReimbursement ?? 0),
  );
  const exchangeShipping = round2(Number(fields.exchangeShipping ?? 0));
  const replacementShipping = round2(Number(fields.replacementShipping ?? 0));

  const shippingCoupon = round2(
    Math.abs(shippingPlatformDiscount) + Math.abs(shippingDiscountStore),
  );

  const shippingActual = round2(Number(fields.shippingActual ?? 0));
  const returnShippingActual = round2(Number(fields.returnShippingActual ?? 0));
  const shippingRefund = round2(Number(fields.shippingRefund ?? 0));

  const extraBreakdownLines: { key: string; label: string; amount: number }[] =
    [];
  for (const uv of row.normalized.unknownValues ?? []) {
    if (uv.amount !== 0 && (uv.category === "income" || uv.amount > 0)) {
      extraBreakdownLines.push({
        key: `custom_${uv.header}`,
        label: uv.header,
        amount: round2(uv.amount),
      });
    }
  }

  const weightCharged =
    typeof row.weightCharged === "number" && row.weightCharged > 0
      ? row.weightCharged
      : typeof fields.weightCharged === "number" && fields.weightCharged > 0
        ? fields.weightCharged
        : null;

  const weightEstimated =
    typeof row.weightEstimated === "number" && row.weightEstimated > 0
      ? row.weightEstimated
      : typeof fields.weightEstimated === "number" && fields.weightEstimated > 0
        ? fields.weightEstimated
        : null;

  const shippingGross =
    Math.abs(shippingActual) > 0
      ? Math.abs(shippingActual)
      : round2(shippingFee + shippingCoupon) > 0
        ? round2(shippingFee + shippingCoupon)
        : 0;

  const customerPayment = round2(Number(fields.customerPayment ?? 0));

  const receiptSubtotal = platformCoupon > 0 ? salesAmount : grossItemsTotal;
  const receiptCoupon = platformCoupon > 0 ? platformCoupon : derivedDiscount;

  // ดึงยอดที่ลูกค้าจ่ายจริงจากไฟล์ (fields.customerPayment) โดยตรง ไม่คำนวณเอง
  const customerTotal = isZeroRefundedOrder
    ? 0
    : customerPayment > 0
      ? customerPayment
      : round2(
          Math.max(
            0,
            salesAmount + shippingFee - platformCoupon,
          ),
        );

  const feeTotal = round2(Number(row.feeTotal ?? fields.feeTotal ?? 0));
  const adjustment = round2(Number(row.adjustment ?? fields.adjustment ?? 0));
  const payout = round2(Number(row.payout ?? fields.payout ?? 0));

  const useCustomerPaidBase =
    activeSeller.vatCalculationBase === "customer_paid";

  const customerFallbackTotal = isZeroRefundedOrder
    ? 0
    : customerTotal > 0
      ? customerTotal
      : round2(salesAmount + shippingFee);

  // หน้าใบกำกับภาษีไม่นำค่าธรรมเนียมแพลตฟอร์มมาหัก แสดงยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย (salesAmount) โดยตรง
  const receiptTotal = isZeroRefundedOrder
    ? 0
    : useCustomerPaidBase
      ? customerFallbackTotal
      : salesAmount > 0
        ? salesAmount
        : customerFallbackTotal;

  const vatRate =
    typeof activeSeller.vatRate === "number" && activeSeller.vatRate >= 0
      ? activeSeller.vatRate
      : 7;
  const receiptPreVatAmount = round2(receiptTotal / (1 + vatRate / 100));
  const receiptVatAmount = round2(receiptTotal - receiptPreVatAmount);

  const total = receiptTotal;
  const preVatAmount = round2(total / (1 + vatRate / 100));
  const vatAmount = round2(total - preVatAmount);

  const effectiveDate = row.paidDate || row.createdDate || "";
  const formattedInvoiceNo = formatInvoiceNoWithPrefix(
    row.invoiceNo,
    activeSeller.invoicePrefix,
    effectiveDate,
  );
  const receiptNo = formatReceiptNoWithPrefix(
    row.invoiceNo,
    activeSeller.receiptPrefix,
    effectiveDate,
  );

  return {
    invoiceNo: formattedInvoiceNo,
    receiptNo,
    orderId: row.externalId,
    orderCode: row.orderCode ?? null,
    channel: row.channel || "TikTok",
    trackingNo: row.trackingNo ?? null,
    courier: row.courier ?? null,
    issuedAt: new Date().toISOString(),
    createdDate: row.createdDate || row.paidDate,
    paidDate: row.paidDate,
    seller: activeSeller,
    customer: {
      name: row.buyerName || row.customerName || null,
      phone: row.customerPhone ?? null,
      address: row.buyerAddress || row.customerAddress || null,
      postalCode: row.postalCode ?? null,
      province: row.province ?? null,
      taxId: row.buyerTaxId || null,
    },
    items,
    grossItemsTotal,
    discountTotal: derivedDiscount,
    discountCode: row.discountCode ?? null,
    storeDiscount: derivedDiscount,
    platformCoupon,
    platformDiscount,
    platformCofundCoupon,
    sellerCofundCoupon,
    platformDiscountRefund,
    platformCofundCouponRefund,
    sellerCofundCouponRefund,
    salesAmount,
    shippingFee,
    shippingCustomerFee,
    shippingGross,
    shippingCoupon,
    shippingPlatformDiscount,
    shippingDiscountStore,
    shippingSubsidy,
    guaranteeReimbursement,
    exchangeShipping,
    replacementShipping,
    shippingActual,
    returnShippingActual,
    shippingRefund,
    extraBreakdownLines,
    weightEstimated,
    weightCharged,
    customerPayment,
    customerTotal,
    feeTotal,
    adjustment,
    payout,
    receiptSubtotal,
    receiptCoupon,
    receiptTotal,
    receiptPreVatAmount,
    receiptVatAmount,
    receiptTotalText: bahtText(receiptTotal),
    preVatAmount,
    vatAmount,
    total,
    totalText: bahtText(total),
  };
}
