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
  enableFullTaxInvoice?: boolean;
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
  enableFullTaxInvoice: false,
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

export function extractYearMonthFromDateOrSeq(
  dateStr?: string | null,
  rawInvoiceNo?: string | null,
): { yyyy: string; yy: string; mm: string; yymm: string } | null {
  if (dateStr) {
    const trimmedDate = dateStr.trim();
    const dateMatch = /^(\d{4})[-/](\d{2})/.exec(trimmedDate);
    if (dateMatch) {
      const yyyy = dateMatch[1]!;
      const mm = dateMatch[2]!;
      const monthNum = Number(mm);
      if (monthNum >= 1 && monthNum <= 12) {
        const yy = yyyy.slice(2);
        return { yyyy, yy, mm, yymm: `${yy}${mm}` };
      }
    }
  }
  if (rawInvoiceNo) {
    const trimmedRaw = rawInvoiceNo.trim();
    const seqYmMatch = /^SEQ\/(\d{2})(0[1-9]|1[0-2])\/\d+$/i.exec(trimmedRaw);
    if (seqYmMatch) {
      const yy = seqYmMatch[1]!;
      const mm = seqYmMatch[2]!;
      return { yyyy: `20${yy}`, yy, mm, yymm: `${yy}${mm}` };
    }
  }
  return null;
}

export function extractDocumentLeadPrefix(
  pattern: string | null | undefined,
  fallbackLead = "",
): string {
  const raw = (pattern ?? "").trim();
  if (!raw) return fallbackLead;
  const match = /^(.*?)(\d+)(\D*)$/.exec(raw);
  if (!match) {
    return raw.replace(/[/_-]+$/, "");
  }
  const prefix = match[1] ?? "";
  const yyyymmMatch = /^(.*?)(20\d{2}|25\d{2})(0[1-9]|1[0-2])(\D*)$/.exec(
    prefix,
  );
  if (yyyymmMatch) {
    return (yyyymmMatch[1] ?? "").replace(/[/_-]+$/, "");
  }
  const yymmMatch = /^(.*?)(\d{2})(0[1-9]|1[0-2])(\D*)$/.exec(prefix);
  if (yymmMatch) {
    return (yymmMatch[1] ?? "").replace(/[/_-]+$/, "");
  }
  return prefix.replace(/[/_-]+$/, "");
}

export function buildDocumentPatternFromLead(
  leadPrefix: string | null | undefined,
  sampleYm = "2610",
): string {
  const cleaned = (leadPrefix ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{M}\p{N}_-]/gu, "")
    .slice(0, 16);
  return `${cleaned}${sampleYm}/00001`;
}

export function formatRunningDocumentNo(
  pattern: string | null | undefined,
  seqIndex: number,
  fallbackPattern: string,
  dateStr?: string | null,
  rawInvoiceNo?: string | null,
): string {
  const trimmedPattern = (pattern ?? "").trim();
  const safeSeq =
    Number.isFinite(seqIndex) && seqIndex >= 1 ? Math.floor(seqIndex) : 1;
  const offset = safeSeq - 1;
  const ymInfo = extractYearMonthFromDateOrSeq(dateStr, rawInvoiceNo);
  const raw =
    trimmedPattern && !/\d/.test(trimmedPattern)
      ? buildDocumentPatternFromLead(trimmedPattern, ymInfo?.yymm ?? "2610")
      : trimmedPattern || fallbackPattern;

  const match = /^(.*?)(\d+)(\D*)$/.exec(raw);
  if (match) {
    let prefix = match[1] ?? "";
    const digits = match[2]!;
    const suffix = match[3] ?? "";
    let startNum = Number(digits);
    const padLen = digits.length;

    if (ymInfo) {
      const yyyymmMatch = /^(.*?)(20\d{2}|25\d{2})(0[1-9]|1[0-2])(\D*)$/.exec(
        prefix,
      );
      if (yyyymmMatch) {
        const lead = yyyymmMatch[1] ?? "";
        const tplYear = yyyymmMatch[2]!;
        const tplMonth = yyyymmMatch[3]!;
        const sep = yyyymmMatch[4] ?? "";
        const targetYear = tplYear.startsWith("25")
          ? String(Number(ymInfo.yyyy) + 543)
          : ymInfo.yyyy;
        if (`${tplYear}${tplMonth}` !== `${targetYear}${ymInfo.mm}`) {
          startNum = 1;
        }
        prefix = `${lead}${targetYear}${ymInfo.mm}${sep}`;
      } else {
        const yymmMatch = /^(.*?)(\d{2})(0[1-9]|1[0-2])(\D*)$/.exec(prefix);
        if (yymmMatch) {
          const lead = yymmMatch[1] ?? "";
          const tplYy = yymmMatch[2]!;
          const tplMm = yymmMatch[3]!;
          const sep = yymmMatch[4] ?? "";
          if (`${tplYy}${tplMm}` !== ymInfo.yymm) {
            startNum = 1;
          }
          prefix = `${lead}${ymInfo.yymm}${sep}`;
        }
      }
    }

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
  paidDate?: string | null,
): string | null {
  if (!rawInvoiceNo) return null;
  const trimmedRaw = rawInvoiceNo.trim();
  if (!trimmedRaw) return null;
  const seqIndex = extractSequenceIndex(trimmedRaw);
  return formatRunningDocumentNo(
    invoicePrefix,
    seqIndex,
    DEFAULT_SELLER.invoicePrefix,
    paidDate,
    trimmedRaw,
  );
}

export function formatReceiptNoWithPrefix(
  rawInvoiceNoOrExternalId: string | null | undefined,
  receiptPrefix?: string,
  dateStr?: string | null,
): string {
  const seqIndex = extractSequenceIndex(rawInvoiceNoOrExternalId);
  return formatRunningDocumentNo(
    receiptPrefix,
    seqIndex,
    DEFAULT_SELLER.receiptPrefix,
    dateStr,
    rawInvoiceNoOrExternalId,
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
