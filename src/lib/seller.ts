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
  vatCalculationBase?: VatCalculationBase;
  defaultPaperSize?: DefaultInvoicePaperSize;
  showSkuInAbbreviated?: boolean;
  showSkuInFull?: boolean;
  showFeeBreakdown?: boolean;
  showShippingTracking?: boolean;
  showSignatureBlock?: boolean;
  footerNote?: string;
}

export const DEFAULT_SELLER: Required<SellerInfo> = {
  name: process.env.SELLER_NAME ?? "บริษัท ชีเฮง จำกัด (สำนักงานใหญ่)",
  branchName: "สำนักงานใหญ่",
  address:
    process.env.SELLER_ADDRESS ??
    "3675 ถนนพระรามที่ 4 แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110",
  taxId: process.env.SELLER_TAX_ID ?? "0655568002694",
  phone: "",
  email: "",
  vatRate: Number(process.env.SELLER_VAT_RATE ?? 7),
  invoicePrefix: process.env.INVOICE_PREFIX ?? "TT",
  vatCalculationBase: "payout",
  defaultPaperSize: "a6",
  showSkuInAbbreviated: false,
  showSkuInFull: true,
  showFeeBreakdown: true,
  showShippingTracking: true,
  showSignatureBlock: true,
  footerNote: "",
};

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
