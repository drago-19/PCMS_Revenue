import {
  formatInvoiceNoWithPrefix,
  formatReceiptNoWithPrefix,
  SELLER,
  type SellerInfo,
} from "./seller";
import { isCompensationTransactionType } from "./invoice-eligibility";
import { bahtText, round2 } from "./format";
import type { TransactionRow } from "./queries";

export interface InvoiceItem {
  sku: string;
  name?: string;
  unitPrice?: number;
  qty: number;
  lineTotal?: number;
  isCompensation?: boolean;
  compensationType?: string;
  referenceOrderId?: string | null;
  referenceOrderCode?: string | null;
  referenceItemsSummary?: string | null;
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
  isPlatformCompensation?: boolean;
  compensationType?: string | null;
  relatedOrderId?: string | null;
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
  /** ค่าจัดส่งสินค้าที่ออกโดย Shopee (จากไฟล์รายได้ Shopee) — Shopee เท่านั้น */
  shippingIssuedByShopee?: number;
  /** บรรทัดหักค่าจัดส่งสินค้าที่ออก โดย Shopee (ติดลบ เท่ากับที่ Shopee หักคืน) — Shopee เท่านั้น */
  shippingDeductedByShopee?: number;
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

export function isPlatformCompensationRow(row: {
  channel?: string | null;
  transactionType?: string | null;
  payout: number;
}): boolean {
  const ch = row.channel || "TikTok";
  return (
    ch === "TikTok" &&
    isCompensationTransactionType(row.transactionType) &&
    row.payout > 0
  );
}

export function isOrderEligibleForInvoice(row: {
  channel?: string | null;
  transactionType?: string | null;
  income: number;
  payout: number;
  orderCode?: string | null;
  productDetail?: string | null;
  omsItems?: unknown[] | null;
  isNoProductPriceOrder?: boolean;
  lineComparisonStatus?:
  | "matched"
  | "amount_diff"
  | "orders_only"
  | "shipnity_only";
}): boolean {
  // 0. รายการชดเชยจากแพลตฟอร์ม / โลจิสติกส์ ของ TikTok ที่มียอดรับสุทธิ > 0
  if (isPlatformCompensationRow(row)) {
    return true;
  }

  // 1. ต้องเป็นบิลขายปกติ: มียอดขาย > 0 และยอดรับสุทธิ > 0 และไม่ใช่บิลเปลี่ยนสินค้า 0 บาท
  if (row.isNoProductPriceOrder) return false;
  if (row.income <= 0) return false;
  if (row.payout <= 0) return false;

  // 2. ต้องเป็นข้อมูลที่ครบ (Link Status = "linked"):
  const hasOmsCode = Boolean(row.orderCode && row.orderCode.trim() !== "");
  if (!hasOmsCode) return false;

  const ch = row.channel || "TikTok";
  const hasRealProductDetail = Boolean(
    row.productDetail &&
    row.productDetail.trim() !== "" &&
    row.productDetail.trim() !== "/" &&
    (ch === "Lazada" || row.productDetail.includes("·")),
  );
  const hasItems = Boolean(
    hasRealProductDetail || (row.omsItems && row.omsItems.length > 0),
  );
  // แยกเงื่อนไขตามช่องทางชัดเจน (Strict Platform Financial Isolation):
  if (ch === "TikTok") {
    if (row.transactionType === "คำสั่งซื้อ (OMS)") return false;
    if (!hasItems) return false;
  } else if (ch === "Shopee") {
    if (!hasItems) return false;
  } else if (ch === "Facebook") {
    // บิล Facebook ต้องมีรายชื่ออยู่ในไฟล์สรุปจากฝ่ายบัญชีเท่านั้นถึงจะอนุญาตให้ยื่นภาษี/ออกใบกำกับภาษีได้
    if (row.lineComparisonStatus === "shipnity_only") return false;
    if (!hasItems) return false;
  } else if (ch === "Lazada") {
    if (!hasItems) return false;
  } else if (ch === "LINE") {
    // บิล LINE OA ต้องมีรายชื่ออยู่ในไฟล์สรุปจากฝ่ายบัญชีเท่านั้นถึงจะอนุญาตให้ยื่นภาษี/ออกใบกำกับภาษีได้
    if (row.lineComparisonStatus === "shipnity_only") return false;
    if (!hasItems) return false;
  } else if (ch === "Other") {
    if (!hasItems) return false;
  } else {
    if (!hasItems) return false;
  }

  return true;
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
  const ch = row.channel || "TikTok";
  const isAccountingPrimaryChannel = ch === "LINE" || ch === "Facebook";
  const rawIncome = isAccountingPrimaryChannel
    ? Number(row.income ?? fields.incomeTotal ?? 0)
    : Number(fields.incomeTotal ?? row.income ?? 0);
  const rawPayout = isAccountingPrimaryChannel
    ? Number(row.payout ?? fields.payout ?? 0)
    : Number(fields.payout ?? row.payout ?? 0);
  const rawRefundAfter = Number(fields.refundAfterDiscount ?? 0);
  const isPlatformCompensation = isPlatformCompensationRow({
    channel: row.channel,
    transactionType: row.transactionType,
    payout: rawPayout,
  });
  const compAmount = isPlatformCompensation
    ? round2(Math.max(rawPayout, Number(row.adjustment ?? fields.adjustment ?? 0)))
    : 0;
  const isZeroRefundedOrder =
    !isPlatformCompensation &&
    row.transactionType !== "คำสั่งซื้อ (OMS)" &&
    rawIncome <= 0 &&
    rawPayout <= 0 &&
    (rawRefundAfter < 0 || Number(fields.productAfterDiscount ?? 0) <= 0);

  const isOmsChannel =
    ch === "Shopee" || ch === "Facebook" || ch === "Lazada" || ch === "LINE" || ch === "Other";
  const rawProductAfter = Number(fields.productAfterDiscount ?? 0);
  const rawRefundAfterVal = Number(fields.refundAfterDiscount ?? 0);
  const productAfterWithRefund = round2(rawProductAfter + rawRefundAfterVal);
  const custShippingFee = round2(
    Number(row.shippingFeeCustomer ?? fields.shippingCustomerFee ?? 0),
  );
  // ค่าจัดส่งที่ Shopee ออกให้ เก็บแยกช่องทางตามกฎ Strict Platform Isolation
  // แถวที่นำเข้าก่อนมีฟิลด์นี้ยังอ่านได้จาก unknownValues ที่บันทึกไว้เดิม (ไม่ต้องนำเข้าไฟล์ซ้ำ)
  const shopeeIssuedShippingHeader = "ค่าจัดส่งสินค้าที่ออกโดย Shopee";
  const shopeeIssuedFromUnknown =
    ch === "Shopee"
      ? round2(
        (row.normalized.unknownValues ?? [])
          .filter((uv) => uv.header === shopeeIssuedShippingHeader)
          .reduce((sum, uv) => sum + Number(uv.amount ?? 0), 0),
      )
      : 0;
  const shippingIssuedByShopee =
    ch === "Shopee"
      ? fields.shippingIssuedByShopee !== undefined
        ? round2(Number(fields.shippingIssuedByShopee))
        : shopeeIssuedFromUnknown
      : 0;
  const shippingIssuedOffset = Math.max(0, shippingIssuedByShopee);
  // Shopee หักค่าจัดส่งที่ตัวเองออกให้คืนจากยอดโอนเท่ากัน → ใบกำกับต้องมีบรรทัดหักลบ
  // ให้จับคู่กับบรรทัดบวก (เหมือนคู่ ±「ส่วนลดค่าจัดส่ง」/「การจัดส่ง」ของ TikTok)
  const shippingDeductedByShopee =
    ch === "Shopee" ? -shippingIssuedOffset : 0;

  // สำหรับ TikTok:
  // productAfterDiscount คือยอดรวมค่าสินค้าหลังหักส่วนลดร้านค้า (ไม่รวมค่าขนส่ง)
  // หากมี productAfterDiscount > 0 ให้บวก refundAfterDiscount (ถ้ามีคืนเงินบางส่วน) เป็นยอดขายสินค้า (salesAmount)
  // หากไม่มี ให้ใช้ rawIncome - Math.max(0, custShippingFee)
  // สำหรับ LINE / Facebook ที่ยอด 2 ไฟล์ไม่ตรงกัน:
  // ยึดยอดจากไฟล์สรุปฝ่ายบัญชี (rawIncome - custShippingFee) เป็นหลักในการออกใบกำกับภาษีเสมอ
  const productSalesAmount = isPlatformCompensation
    ? compAmount
    : isAccountingPrimaryChannel && rawIncome > 0
      ? round2(Math.max(0, rawIncome - Math.max(0, custShippingFee)))
      : productAfterWithRefund > 0
        ? productAfterWithRefund
        : rawIncome > 0
          ? round2(
            Math.max(
              0,
              rawIncome - Math.max(0, custShippingFee) - shippingIssuedOffset,
            ),
          )
          : 0;

  const salesAmount = isZeroRefundedOrder
    ? 0
    : productSalesAmount;
  const shippingFee = isPlatformCompensation ? 0 : custShippingFee;

  let items: InvoiceItem[] = [];
  const rawRelatedId = String(
    row.relatedOrderId ?? fields.relatedOrderId ?? "",
  ).trim();
  const validRelatedOrderId =
    rawRelatedId && rawRelatedId !== "/" && rawRelatedId !== "-"
      ? rawRelatedId
      : null;

  if (isPlatformCompensation) {
    const formalCompTitle =
      row.transactionType === "เงินชดเชยด้านโลจิสติกส์"
        ? "เงินชดเชยด้านโลจิสติกส์"
        : "การชดเชยจากแพลตฟอร์ม";
    items = [
      {
        sku: validRelatedOrderId
          ? `COMP-${validRelatedOrderId}`
          : row.orderCode
            ? `COMP-${row.orderCode}`
            : "COMP-TIKTOK",
        name: validRelatedOrderId
          ? `${formalCompTitle} (คำสั่งซื้อ #${validRelatedOrderId})`
          : formalCompTitle,
        unitPrice: compAmount,
        qty: 1,
        lineTotal: compAmount,
        isCompensation: true,
        compensationType: formalCompTitle,
        referenceOrderId: validRelatedOrderId,
        referenceOrderCode: row.orderCode ?? null,
        referenceItemsSummary: null,
      },
    ];
  } else if (row.omsItems && row.omsItems.length > 0) {
    const rawItems = row.omsItems.map((it) => ({
      sku: it.skuCode,
      name: it.productName,
      unitPrice: round2(it.unitPrice),
      qty: it.quantity,
      lineTotal: round2(it.unitPrice * it.quantity),
    }));
    const rawItemsSum = round2(
      rawItems.reduce((acc, it) => acc + (it.lineTotal ?? 0), 0),
    );
    // กรณี LINE OA หรือ Facebook ที่ยอดในไฟล์บัญชีและไฟล์สินค้า Shipnity ไม่ตรงกัน (amount_diff):
    // เวลายื่นภาษีและออกใบกำกับภาษีให้ยึดยอดจากไฟล์ของบัญชี (salesAmount) เป็นหลัก 100%
    if (
      isAccountingPrimaryChannel &&
      row.lineComparisonStatus === "amount_diff" &&
      salesAmount > 0 &&
      Math.abs(rawItemsSum - salesAmount) >= 0.01
    ) {
      let running = 0;
      const totalQtyAll = Math.max(
        1,
        rawItems.reduce((acc, it) => acc + Math.max(1, it.qty), 0),
      );
      items = rawItems.map((it, idx) => {
        const isLast = idx === rawItems.length - 1;
        const lineAmt = isLast
          ? round2(Math.max(0, salesAmount - running))
          : rawItemsSum > 0
            ? round2((salesAmount * (it.lineTotal ?? 0)) / rawItemsSum)
            : round2((salesAmount * Math.max(1, it.qty)) / totalQtyAll);
        running = round2(running + lineAmt);
        const unitAmt = round2(lineAmt / Math.max(1, it.qty));
        return {
          ...it,
          unitPrice: unitAmt,
          lineTotal: lineAmt,
        };
      });
    } else {
      items = rawItems;
    }
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
    isAccountingPrimaryChannel && row.lineComparisonStatus === "amount_diff"
      ? 0
      : grossItemsTotal > salesAmount
        ? round2(grossItemsTotal - salesAmount)
        : explicitDiscount;

  const rawPlatformDiscount = round2(Number(fields.platformDiscount ?? 0));
  const rawPlatformCofundCoupon = round2(
    Number(fields.platformCofundCoupon ?? 0),
  );
  const rawSellerCofundCoupon = round2(Number(fields.sellerCofundCoupon ?? 0));
  const platformDiscountRefund = round2(
    Number(fields.platformDiscountRefund ?? 0),
  );
  const platformCofundCouponRefund = round2(
    Number(fields.platformCofundCouponRefund ?? 0),
  );
  const sellerCofundCouponRefund = round2(
    Number(fields.sellerCofundCouponRefund ?? 0),
  );

  // หากมีการคืนสินค้าบางส่วน (platformDiscountRefund < 0 / platformCofundCouponRefund < 0)
  // ให้ใช้ยอดส่วนลดแพลตฟอร์มสุทธิหลังหักส่วนที่คืนแล้ว เพื่อให้รายการสินค้า + ส่วนลดแพลตฟอร์ม ตรงกับยอดรายได้ (salesAmount) 100%
  const platformDiscount =
    platformDiscountRefund < 0 && rawPlatformDiscount > 0
      ? round2(Math.max(0, rawPlatformDiscount + platformDiscountRefund))
      : rawPlatformDiscount;
  const platformCofundCoupon =
    platformCofundCouponRefund < 0 && rawPlatformCofundCoupon > 0
      ? round2(
        Math.max(0, rawPlatformCofundCoupon + platformCofundCouponRefund),
      )
      : rawPlatformCofundCoupon;
  const sellerCofundCoupon =
    sellerCofundCouponRefund !== 0 && rawSellerCofundCoupon !== 0
      ? round2(rawSellerCofundCoupon + sellerCofundCouponRefund)
      : rawSellerCofundCoupon;

  const platformCoupon = round2(
    Math.abs(platformDiscount) + Math.abs(platformCofundCoupon),
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

  const customerPayment = isAccountingPrimaryChannel
    ? round2(rawIncome)
    : round2(Number(fields.customerPayment ?? 0));

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
  const adjustment = isPlatformCompensation
    ? 0
    : round2(Number(row.adjustment ?? fields.adjustment ?? 0));
  const payout = round2(Number(row.payout ?? fields.payout ?? 0));

  const useCustomerPaidBase =
    activeSeller.vatCalculationBase === "customer_paid";

  const customerFallbackTotal = isZeroRefundedOrder
    ? 0
    : customerTotal > 0
      ? customerTotal
      : round2(salesAmount + shippingFee);

  const omsReceiptTotal = round2(
    rawIncome > 0
      ? rawIncome + shippingDeductedByShopee
      : salesAmount + Math.max(0, shippingFee),
  );

  const shipPlatformDiscount = Math.max(0, shippingPlatformDiscount);
  const custFee = Math.max(0, shippingCustomerFee);
  const subsidy = Math.max(0, shippingSubsidy);
  const maxPositiveShippingOffset = round2(shipPlatformDiscount + custFee + subsidy);

  // การจัดส่งที่นำมาหักล้างในใบกำกับภาษี:
  // กรณีมีส่วนต่าง (เช่น รับ 98 จ่าย 101): แสดงเท่าทุนมาคิด (-98)
  let effectiveShippingActual = 0;
  if (shippingActual !== 0 && (shippingActual > 0 || maxPositiveShippingOffset > 0)) {
    if (shippingActual < 0) {
      effectiveShippingActual = -Math.min(Math.abs(shippingActual), maxPositiveShippingOffset);
    } else {
      effectiveShippingActual = shippingActual;
    }
  }

  // ค่าขนส่งสุทธิที่นำมารวมเป็นรายได้ในใบกำกับภาษี
  // 1. กรณีเท่าทุน หรือร้านออกส่วนต่างเกิน: หักล้างกันเป็น 0 พอดี
  // 2. กรณีเราได้ค่าขนส่งบวกเพิ่ม (เช่น ลูกค้าจ่าย 18 แล้วไม่มีค่าส่งหักล้าง): บวกเพิ่มเข้าไปในใบกำกับภาษีเป็นรายได้
  const netShippingForInvoice = round2(
    custFee + effectiveShippingActual
  );

  const tiktokReceiptTotal = round2(
    salesAmount + Math.max(0, netShippingForInvoice)
  );

  // หน้าใบกำกับภาษีไม่นำค่าธรรมเนียมแพลตฟอร์มหรือค่าขนส่งที่ร้านค้าจ่ายเองมาหัก
  // - Shopee / Facebook / LINE / Other: แสดงค่าสินค้า + ค่าขนส่งลูกค้า (ตรงกับยอดรายได้ในไฟล์ Shipnity)
  // - TikTok: แสดงยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย + ค่าขนส่งบวกเพิ่มที่เก็บจากลูกค้า (หรือยอดชดเชยจากแพลตฟอร์ม)
  const receiptTotal = isZeroRefundedOrder
    ? 0
    : isPlatformCompensation
      ? compAmount
      : isOmsChannel
        ? omsReceiptTotal
        : useCustomerPaidBase
          ? customerFallbackTotal
          : tiktokReceiptTotal;

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
  const resolvedChannel = row.channel || "TikTok";
  const formattedInvoiceNo = formatInvoiceNoWithPrefix(
    row.invoiceNo,
    activeSeller.invoicePrefix,
    effectiveDate,
    resolvedChannel,
    activeSeller.channelInvoicePrefixes,
  );
  const receiptNo = formatReceiptNoWithPrefix(
    row.invoiceNo,
    activeSeller.receiptPrefix,
    effectiveDate,
    resolvedChannel,
    activeSeller.channelInvoicePrefixes,
    activeSeller.invoicePrefix,
  );

  const displayOrderId = row.externalId.includes("|")
    ? row.orderCode || row.externalId.split("|")[0] || row.externalId
    : row.externalId;

  return {
    invoiceNo: formattedInvoiceNo,
    receiptNo,
    orderId: displayOrderId,
    orderCode: row.orderCode ?? null,
    channel: row.channel || "TikTok",
    isPlatformCompensation,
    compensationType: isPlatformCompensation ? row.transactionType : null,
    relatedOrderId: validRelatedOrderId,
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
    shippingIssuedByShopee,
    shippingDeductedByShopee,
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
