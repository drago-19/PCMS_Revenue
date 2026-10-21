export interface SellerInfo {
  name: string;
  address: string;
  taxId: string;
  vatRate: number;
  invoicePrefix: string;
}

export const SELLER: SellerInfo = {
  name: process.env.SELLER_NAME ?? "บริษัท ชีเฮง จำกัด (สำนักงานใหญ่)",
  address:
    process.env.SELLER_ADDRESS ??
    "3675 ถนนพระรามที่ 4 แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110",
  taxId: process.env.SELLER_TAX_ID ?? "0655568002694",
  vatRate: Number(process.env.SELLER_VAT_RATE ?? 7),
  invoicePrefix: process.env.INVOICE_PREFIX ?? "TT",
};
