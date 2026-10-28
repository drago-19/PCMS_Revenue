import { SELLER, type SellerInfo } from "./seller";
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
  salesAmount: number;
  shippingFee: number;
  shippingGross: number;
  shippingCoupon: number;
  shippingActual: number;
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
  const salesAmount = round2(
    Number(fields.productAfterDiscount ?? row.income ?? 0),
  );
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

  const shippingCoupon = round2(
    Math.abs(Number(fields.shippingPlatformDiscount ?? 0)) +
      Math.abs(Number(fields.shippingDiscountStore ?? 0)),
  );

  const shippingActual = round2(Math.abs(Number(fields.shippingActual ?? 0)));

  // ค่าจัดส่งที่ดึงจากไฟล์ที่นำเข้าจริง (ไม่ใช้เลขคงที่):
  // ถ้าระบุค่าส่งลูกค้า (shippingFee) หรือมีส่วนลดค่าส่งแพลตฟอร์ม (shippingCoupon) ให้ใช้ผลรวมตามจริงของบิลนั้น
  // หากเป็น 0 ทั้งคู่แต่ในไฟล์ Settlement มี shippingActual ให้ดึงจาก shippingActual
  const shippingGross =
    round2(shippingFee + shippingCoupon) > 0
      ? round2(shippingFee + shippingCoupon)
      : shippingActual;

  const customerPayment = round2(Number(fields.customerPayment ?? 0));

  // สำหรับใบกำกับภาษีอย่างย่อ (รูปแบบใบเสร็จคำสั่งซื้อที่ CEO ต้องการ):
  // - กรณีมีคูปองแพลตฟอร์ม (platformCoupon > 0): ยอดรวม = salesAmount (ราคาหลังส่วนลดร้านค้า) แล้วหักคูปองแพลตฟอร์ม
  // - กรณีเป็นออเดอร์ OMS หรือส่วนลดร้านค้าล้วน (platformCoupon === 0): ยอดรวม = grossItemsTotal แล้วหักส่วนลด/คูปอง (derivedDiscount)
  const receiptSubtotal = platformCoupon > 0 ? salesAmount : grossItemsTotal;
  const receiptCoupon = platformCoupon > 0 ? platformCoupon : derivedDiscount;
  const customerTotal = round2(
    Math.max(
      0,
      receiptSubtotal + shippingGross - receiptCoupon - shippingCoupon,
    ),
  );

  const feeTotal = round2(Number(row.feeTotal ?? fields.feeTotal ?? 0));
  const adjustment = round2(Number(row.adjustment ?? fields.adjustment ?? 0));
  const payout = round2(Number(row.payout ?? fields.payout ?? 0));

  const useCustomerPaidBase =
    activeSeller.vatCalculationBase === "customer_paid";

  // ใช้ยอดที่ร้านได้รับจริง (payout / ยอดที่คุณได้รับ) เป็นค่าเริ่มต้น หรือสลับเป็นยอดที่ลูกค้าจ่ายตามตั้งค่า
  const receiptTotal = useCustomerPaidBase
    ? customerTotal
    : payout > 0
      ? payout
      : customerTotal;

  const vatRate =
    typeof activeSeller.vatRate === "number" && activeSeller.vatRate >= 0
      ? activeSeller.vatRate
      : 7;
  const receiptPreVatAmount = round2(receiptTotal / (1 + vatRate / 100));
  const receiptVatAmount = round2(receiptTotal - receiptPreVatAmount);

  const total = useCustomerPaidBase
    ? customerTotal > 0
      ? customerTotal
      : round2(salesAmount + shippingFee)
    : payout > 0
      ? payout
      : round2(salesAmount + shippingFee);
  const preVatAmount = round2(total / (1 + vatRate / 100));
  const vatAmount = round2(total - preVatAmount);

  const dateCompact = (row.paidDate || row.createdDate || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const receiptNo = dateCompact
    ? `${dateCompact}-${row.externalId}`
    : row.externalId;

  return {
    invoiceNo: row.invoiceNo,
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
    salesAmount,
    shippingFee,
    shippingGross,
    shippingCoupon,
    shippingActual,
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
