export type VatCalculationBase = "payout" | "customer_paid";
export type DefaultInvoicePaperSize = "a6" | "a4-4up" | "80mm" | "a4";

export interface SellerInfo {
  name: string;
  branchName?: string;
  address: string;
  taxId: string;
  phone?: string;
  email?: string;
  vatRate: number;
  invoicePrefix: string;
  receiptPrefix?: string;
  vatCalculationBase?: VatCalculationBase;
  defaultPaperSize?: DefaultInvoicePaperSize;
  showInvoiceNo?: boolean;
  showReceiptNo?: boolean;
  showSkuInAbbreviated?: boolean;
  showSkuInFull?: boolean;
  showFeeBreakdown?: boolean;
  showShippingTracking?: boolean;
  showSignatureBlock?: boolean;
  footerNote?: string;
}

export const DEFAULT_SELLER: Required<SellerInfo> = {
  name: process.env.SELLER_NAME ?? "บริษัท ดราก้อน 19 จำกัด",
  branchName: "สำนักงานใหญ่",
  address:
    process.env.SELLER_ADDRESS ??
    "3675 ถนนพระรามที่ 4 แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110",
  taxId: process.env.SELLER_TAX_ID ?? "0655568002694",
  phone: "",
  email: "",
  vatRate: Number(process.env.SELLER_VAT_RATE ?? 7),
  invoicePrefix: process.env.INVOICE_PREFIX ?? "TT2610/00001",
  receiptPrefix: process.env.RECEIPT_PREFIX ?? "RC2610/00001",
  vatCalculationBase: "payout",
  defaultPaperSize: "a6",
  showInvoiceNo: true,
  showReceiptNo: true,
  showSkuInAbbreviated: false,
  showSkuInFull: true,
  showFeeBreakdown: true,
  showShippingTracking: true,
  showSignatureBlock: true,
  footerNote: "",
};

export const DEFAULT_SEEHENG_SELLER: Required<SellerInfo> = {
  ...DEFAULT_SELLER,
  name: "บริษัท ชีเฮง จำกัด",
  branchName: "สำนักงานใหญ่",
};

export function extractSequenceIndex(
  rawInvoiceNo: string | null | undefined,
): number {
  if (!rawInvoiceNo) return 1;
  const trimmed = rawInvoiceNo.trim();
  const slashMatch = /\/(\d+)$/.exec(trimmed);
  if (slashMatch) {
    const n = Number(slashMatch[1]);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }
  const trailingMatch = /(\d+)\D*$/.exec(trimmed);
  if (trailingMatch) {
    const n = Number(trailingMatch[1]);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }
  return 1;
}

export function formatRunningDocumentNo(
  pattern: string | null | undefined,
  seqIndex: number,
  fallbackPattern: string,
): string {
  const raw = (pattern ?? "").trim() || fallbackPattern;
  const safeSeq =
    Number.isFinite(seqIndex) && seqIndex >= 1 ? Math.floor(seqIndex) : 1;
  const offset = safeSeq - 1;

  const match = /^(.*?)(\d+)(\D*)$/.exec(raw);
  if (match) {
    const prefix = match[1] ?? "";
    const digits = match[2]!;
    const suffix = match[3] ?? "";
    const startNum = Number(digits);
    const padLen = digits.length;
    if (Number.isFinite(startNum)) {
      const nextNum = String(startNum + offset).padStart(padLen, "0");
      return `${prefix}${nextNum}${suffix}`;
    }
  }

  return `${raw}${String(1 + offset).padStart(5, "0")}`;
}

export function formatInvoiceNoWithPrefix(
  rawInvoiceNo: string | null | undefined,
  invoicePrefix?: string,
  _paidDate?: string | null,
): string | null {
  if (!rawInvoiceNo) return null;
  const trimmedRaw = rawInvoiceNo.trim();
  if (!trimmedRaw) return null;
  const seqIndex = extractSequenceIndex(trimmedRaw);
  return formatRunningDocumentNo(
    invoicePrefix,
    seqIndex,
    DEFAULT_SELLER.invoicePrefix,
  );
}

export function formatReceiptNoWithPrefix(
  rawInvoiceNoOrExternalId: string | null | undefined,
  receiptPrefix?: string,
  _dateStr?: string | null,
): string {
  const seqIndex = extractSequenceIndex(rawInvoiceNoOrExternalId);
  return formatRunningDocumentNo(
    receiptPrefix,
    seqIndex,
    DEFAULT_SELLER.receiptPrefix,
  );
}

export const SELLER: SellerInfo = {
  ...DEFAULT_SELLER,
};

export function applySellerSettingsToMemory(next: Partial<SellerInfo>): SellerInfo {
  Object.assign(SELLER, DEFAULT_SELLER, next);
  return { ...SELLER };
}

export function formatSellerDisplayName(
  seller: Pick<SellerInfo, "name" | "branchName">,
): string {
  const rawName = (seller.name ?? "").trim();
  if (seller.branchName === undefined) {
    return rawName;
  }
  const branch = seller.branchName.trim();
  const baseName = rawName.replace(/\s*\(สำนักงานใหญ่\)\s*$/, "").trim();
  if (!branch) {
    return baseName || rawName;
  }
  if (baseName.includes(`(${branch})`) || baseName.endsWith(branch)) {
    return baseName;
  }
  return `${baseName} (${branch})`;
}
