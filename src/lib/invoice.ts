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
  orderId: string;
  orderCode: string | null;
  channel: string;
  trackingNo: string | null;
  courier: string | null;
  issuedAt: string;
  paidDate: string;
  seller: SellerInfo;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  grossItemsTotal: number;
  discountTotal: number;
  salesAmount: number;
  shippingFee: number;
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

export function buildInvoice(row: TransactionRow): InvoiceModel {
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

  const grossItemsTotal =
    items.length > 0 && items.some((i) => i.lineTotal !== undefined)
      ? round2(items.reduce((acc, i) => acc + (i.lineTotal ?? 0), 0))
      : salesAmount;

  const explicitDiscount =
    row.discountTotal !== undefined
      ? round2(Math.abs(row.discountTotal))
      : round2(Math.abs(Number(fields.storeDiscount ?? 0)));

  const derivedDiscount =
    grossItemsTotal > salesAmount
      ? round2(grossItemsTotal - salesAmount)
      : explicitDiscount;

  const total = round2(salesAmount + shippingFee);
  const vatRate = SELLER.vatRate || 7;
  const preVatAmount = round2(total / (1 + vatRate / 100));
  const vatAmount = round2(total - preVatAmount);

  return {
    invoiceNo: row.invoiceNo,
    orderId: row.externalId,
    orderCode: row.orderCode ?? null,
    channel: row.channel || "TikTok",
    trackingNo: row.trackingNo ?? null,
    courier: row.courier ?? null,
    issuedAt: new Date().toISOString(),
    paidDate: row.paidDate,
    seller: SELLER,
    customer: {
      name: row.customerName ?? null,
      phone: row.customerPhone ?? null,
      address: row.customerAddress ?? null,
      postalCode: row.postalCode ?? null,
      province: row.province ?? null,
      taxId: null,
    },
    items,
    grossItemsTotal,
    discountTotal: derivedDiscount,
    salesAmount,
    shippingFee,
    preVatAmount,
    vatAmount,
    total,
    totalText: bahtText(total),
  };
}
