import { SELLER, type SellerInfo } from "./seller";
import { bahtText, round2 } from "./format";
import type { TransactionRow } from "./queries";

export interface InvoiceItem {
  sku: string;
  qty: number;
}

export interface InvoiceModel {
  invoiceNo: string | null;
  orderId: string;
  issuedAt: string;
  paidDate: string;
  seller: SellerInfo;
  items: InvoiceItem[];
  salesAmount: number;
  shippingFee: number;
  total: number;
  totalText: string;
}

export function parseProductItems(detail: string | null): InvoiceItem[] {
  if (!detail || detail === "/") return [];
  const items: InvoiceItem[] = [];
  for (const part of detail.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
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
  const salesAmount = round2(Number(fields.productAfterDiscount ?? 0));
  const shippingFee = round2(Number(fields.shippingCustomerFee ?? 0));
  const total = round2(salesAmount + shippingFee);
  return {
    invoiceNo: row.invoiceNo,
    orderId: row.externalId,
    issuedAt: new Date().toISOString(),
    paidDate: row.paidDate,
    seller: SELLER,
    items: parseProductItems(row.productDetail),
    salesAmount,
    shippingFee,
    total,
    totalText: bahtText(total),
  };
}
