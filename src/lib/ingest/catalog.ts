export type FieldKind =
  | "id"
  | "text"
  | "date"
  | "money"
  | "feeParent"
  | "feeChild"
  | "infoNumber";

export type AggregateMode = "sum" | "first" | "concat" | "max";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  agg: AggregateMode;
  aliases: string[];
}

export const ORDER_TYPE_LABELS = ["คำสั่งซื้อ", "order", "orders", "order payment"];

const F = (
  key: string,
  label: string,
  kind: FieldKind,
  aliases: string[],
  agg: AggregateMode = "sum",
): FieldDef => ({ key, label, kind, agg, aliases: [label, ...aliases] });

export const FIELD_DEFS: FieldDef[] = [
  F("orderId", "หมายเลขคำสั่งซื้อ", "id", [
    "หมายเลขคำสั่งซื้อ/การปรับ",
    "Order ID",
    "Order/adjustment ID",
    "Order ID/Adjustment ID",
    "Transaction ID",
  ], "first"),
  F("transactionType", "ประเภทธุรกรรม", "text", [
    "Transaction type",
    "Type",
  ], "first"),
  F("createdAt", "เวลาที่สร้างคำสั่งซื้อ", "date", [
    "Order created time",
    "Created time",
    "Order creation time",
  ], "first"),
  F("paidAt", "เวลาที่ชำระคำสั่งซื้อ", "date", [
    "Order settled time",
    "Settlement time",
    "Payout time",
    "Order payment time",
  ], "first"),
  F("currency", "สกุลเงิน", "text", ["Currency"], "first"),
  F("payout", "ยอดการชำระเงินทั้งหมด", "money", [
    "Total settlement amount",
    "Total payout",
    "Settlement amount",
  ]),
  F("incomeTotal", "รายได้ทั้งหมด", "money", ["Total income", "Total revenue"]),
  F("productAfterDiscount", "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย", "money", [
    "Total product amount after seller discount",
    "Total product after seller discount",
  ]),
  F("productBeforeDiscount", "ยอดรวมค่าสินค้าก่อนหักส่วนลด", "money", [
    "Total product amount before discount",
    "Total product before discount",
  ]),
  F("storeDiscount", "ส่วนลดจากร้านค้า", "money", ["Seller discount", "Store discount"]),
  F("refundAfterDiscount", "ยอดรวมเงินคืนหลังหักส่วนลดจากผู้ขาย", "money", [
    "Total refund after seller discount",
  ]),
  F("refundBeforeDiscount", "ยอดรวมเงินคืนก่อนหักส่วนลดจากร้านค้า", "money", [
    "Total refund before seller discount",
  ]),
  F("refundStoreDiscount", "เงินคืนจากส่วนลดร้านค้า", "money", [
    "Refund from seller discount",
  ]),
  F("feeTotal", "ค่าธรรมเนียมทั้งหมด", "money", ["Total fees", "Total fee"]),
  F("adjustment", "จำนวนการปรับยอด", "money", [
    "Adjustment amount",
    "Adjustment",
  ]),
  F("relatedOrderId", "หมายเลขคำสั่งซื้อที่เกี่ยวข้อง", "id", [
    "Related order ID",
    "Related order",
  ], "first"),
  F("customerPayment", "การชำระเงินของลูกค้า", "money", ["Customer payment"]),
  F("customerRefund", "การคืนเงินจากลูกค้า", "money", ["Customer refund"]),
  F("sellerCofundCoupon", "คูปองส่วนลดร่วมของผู้ขาย", "money", [
    "Seller co-funded coupon",
  ]),
  F("sellerCofundCouponRefund", "การคืนเงินคูปองส่วนลดร่วมของผู้ขาย", "money", [
    "Seller co-funded coupon refund",
  ]),
  F("platformDiscount", "ส่วนลดจากแพลตฟอร์ม", "money", ["Platform discount"]),
  F("platformDiscountRefund", "การคืนเงินส่วนลดจากแพลตฟอร์ม", "money", [
    "Platform discount refund",
  ]),
  F("platformCofundCoupon", "คูปองส่วนลดร่วมของแพลตฟอร์ม", "money", [
    "Platform co-funded coupon",
  ]),
  F("platformCofundCouponRefund", "การคืนเงินคูปองส่วนลดร่วมของแพลตฟอร์ม", "money", [
    "Platform co-funded coupon refund",
  ]),
  F("shippingDiscountStore", "ส่วนลดค่าจัดส่งจากร้านค้า", "money", [
    "Store shipping discount",
  ]),
  F("weightEstimated", "น้ำหนักพัสดุโดยประมาณ", "infoNumber", [
    "Estimated package weight",
  ], "max"),
  F("weightCharged", "น้ำหนักที่เรียกเก็บเงิน", "infoNumber", [
    "Billable weight",
  ], "max"),
  F("productDetail", "รายละเอียดสินค้าที่ขายได้", "text", [
    "Product details",
    "Products sold",
    "SKU details",
  ], "concat"),
  F("customerBank", "ธนาคารของลูกค้าสำหรับการชำระเงิน", "text", [
    "Customer bank",
  ], "first"),

  F("orderFee", "ค่าธรรมเนียมคำสั่งซื้อ", "feeParent", [
    "Order fee",
    "Order service fee",
  ]),
  F("commission", "ค่าคอมมิชชั่น TikTok Shop", "feeParent", [
    "TikTok Shop commission",
  ]),
  F("creditInstallment", "การผ่อนชำระด้วยบัตรเครดิต - มีอัตราดอกเบี้ย", "feeParent", [
    "ค่าผ่อนชำระด้วยบัตรเครดิต - มีอัตราดอกเบี้ย",
    "Credit card installment fee",
    "Credit card installment - interest bearing",
  ]),
  F("shippingTotal", "ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง", "feeParent", [
    "Total actual shipping fee paid by seller",
    "Total shipping fee paid by seller",
  ]),
  F("shippingActual", "ค่าธรรมเนียมการจัดส่งจริง", "feeChild", [
    "Actual shipping fee",
  ]),
  F("shippingPlatformDiscount", "ส่วนลดค่าธรรมเนียมการจัดส่งจากแพลตฟอร์ม", "feeChild", [
    "Platform shipping fee discount",
  ]),
  F("shippingCustomerFee", "ค่าธรรมเนียมการจัดส่งของลูกค้า", "feeChild", [
    "Customer shipping fee",
  ]),
  F("returnShippingActual", "ค่าธรรมเนียมการจัดส่งสินค้าคืนตามจริง", "feeChild", [
    "Actual return shipping fee",
  ]),
  F("shippingRefund", "เงินคืนสำหรับค่าจัดส่ง", "feeChild", ["Shipping refund"]),
  F("shippingSubsidy", "เงินสนับสนุนการจัดส่ง", "feeChild", ["Shipping subsidy"]),
  F("exchangeShipping", "ค่าจัดส่งสินค้าที่แลกเปลี่ยน (ลูกค้าเป็นผู้จ่าย)", "feeChild", [
    "Exchange shipping fee (paid by customer)",
  ]),
  F("replacementShipping", "ค่าจัดส่งสินค้าทดแทน (ลูกค้าเป็นผู้จ่าย)", "feeChild", [
    "Replacement shipping fee (paid by customer)",
  ]),
  F("affiliateCommission", "ค่าคอมมิชชั่นแอฟฟิลิเอต", "feeParent", [
    "Affiliate commission",
  ]),
  F("affiliateNonCommission", "ค่าคอมมิชชั่นไม่ใช่แอฟฟิลิเอตก่อนหักภาษีเงินได้บุคคลธรรมดา", "feeChild", [
    "Non-affiliate commission before personal income tax",
  ]),
  F("affiliatePit", "ภาษีเงินได้บุคคลธรรมดาที่หักไว้จากคอมมิชชั่นของแอฟฟิลิเอต", "feeChild", [
    "Personal income tax withheld from affiliate commission",
  ]),
  F("affiliatePartnerCommission", "ค่าคอมมิชชั่นของพาร์ทเนอร์แอฟฟิลิเอต", "feeChild", [
    "Affiliate partner commission",
  ]),
  F("affiliateAdsCommission", "ค่าคอมมิชชั่นแอฟฟิลิเอตสำหรับโฆษณาร้านค้า", "feeParent", [
    "Affiliate commission for shop ads",
  ]),
  F("affiliateAdsBeforePit", "ค่าคอมมิชชั่นโฆษณาร้านค้าแอฟฟิลิเอตก่อน PIT", "feeChild", [
    "Shop ads affiliate commission before PIT",
  ]),
  F("affiliateAdsPit", "ภาษีเงินได้บุคคลธรรมดาหัก ณ ที่จ่ายจากค่าคอมมิชชั่นโฆษณาร้านค้าแอฟฟิลิเอต", "feeChild", [
    "PIT withheld from shop ads affiliate commission",
  ]),
  F("affiliateDeposit", "เงินมัดจำค่าคอมมิชชั่นของแอฟฟิลิเอต", "feeChild", [
    "Affiliate commission deposit",
  ]),
  F("affiliateRefund", "การคืนเงินค่าคอมมิชชั่นแอฟฟิลิเอต", "feeChild", [
    "Affiliate commission refund",
  ]),
  F("affiliateAdsPartnerCommission", "ค่าคอมมิชชั่นโฆษณาร้านค้าพาร์ทเนอร์แอฟฟิลิเอต", "feeChild", [
    "Shop ads affiliate partner commission",
  ]),
  F("sfpFee", "ค่าธรรมเนียมการบริการ SFP", "feeParent", ["SFP service fee"]),
  F("bonusRefundService", "ค่าธรรมเนียมบริการคืนเงินโบนัส", "feeParent", [
    "Bonus refund service fee",
  ]),
  F("liveCoupon", "ค่าบริการของคูปองไลฟ์คุ้ม", "feeParent", ["Live coupon service fee"]),
  F("xtraCoupon", "ค่าบริการคูปอง Xtra", "feeParent", ["Xtra coupon fee"]),
  F("eams", "ค่าบริการโปรแกรม EAMS", "feeParent", ["EAMS program fee"]),
  F("brandCampaign", "ค่าบริการแบรนด์ดัง ลดแรง/แฟลชเซล", "feeParent", [
    "Brand campaign fee",
  ]),
  F("paylater", "ค่าธรรมเนียมโปรแกรม TikTok PayLater", "feeParent", [
    "TikTok PayLater fee",
  ]),
  F("growth", "ค่าธรรมเนียมสนับสนุนการเติบโตของร้านค้า", "feeParent", [
    "Seller growth fee",
  ]),
  F("infrastructure", "ค่าธรรมเนียมโครงสร้างพื้นฐาน", "feeParent", [
    "Infrastructure fee",
  ]),
  F("campaignResource", "ค่าทรัพยากรแคมเปญ", "feeParent", ["Campaign resource fee"]),
  F("preorder", "ค่าธรรมเนียมพรีออเดอร์", "feeParent", ["Pre-order fee"]),
  F("gmvMaxCoupon", "คูปอง GMV Max", "feeParent", ["GMV Max Coupon"]),
  F("gmvMaxCouponTax", "ภาษีการขายสำหรับคูปอง GMV Max", "feeParent", [
    "Sales tax for GMV Max coupon",
  ]),
  F("gmvMaxAds", "ค่าโฆษณา GMV Max", "feeParent", ["GMV Max ads cost"]),
  F("guaranteeFee", "Guarantee program fee", "feeParent", [
    "ค่าธรรมเนียมโปรแกรมการรับประกัน",
    "Guarantee program fee",
  ]),
  F("guaranteeReimbursement", "Guarantee program reimbursement", "feeChild", [
    "การชดเชยโปรแกรมการรับประกัน",
  ]),
];

export interface FeeGroupDef {
  key: string;
  label: string;
  fields: string[];
  children: string[];
  sort: number;
}

export const FEE_GROUPS: FeeGroupDef[] = [
  { key: "order_fee", label: "ค่าธรรมเนียมคำสั่งซื้อ", fields: ["orderFee"], children: [], sort: 10 },
  { key: "commission", label: "ค่าคอมมิชชั่น TikTok Shop", fields: ["commission"], children: [], sort: 20 },
  {
    key: "shipping",
    label: "ค่าจัดส่งโดยผู้ขาย",
    fields: ["shippingTotal"],
    children: [
      "shippingActual",
      "shippingPlatformDiscount",
      "shippingCustomerFee",
      "returnShippingActual",
      "shippingRefund",
      "shippingSubsidy",
      "exchangeShipping",
      "replacementShipping",
      "guaranteeReimbursement",
    ],
    sort: 30,
  },
  {
    key: "affiliate",
    label: "ค่าคอมมิชชั่นแอฟฟิลิเอต",
    fields: ["affiliateCommission"],
    children: [
      "affiliateNonCommission",
      "affiliatePit",
      "affiliatePartnerCommission",
      "affiliateDeposit",
      "affiliateRefund",
    ],
    sort: 40,
  },
  {
    key: "affiliate_ads",
    label: "ค่าคอมมิชชั่นแอฟฟิลิเอตสำหรับโฆษณาร้านค้า",
    fields: ["affiliateAdsCommission"],
    children: ["affiliateAdsBeforePit", "affiliateAdsPit", "affiliateAdsPartnerCommission"],
    sort: 50,
  },
  { key: "credit_installment", label: "ค่าผ่อนชำระด้วยบัตรเครดิต", fields: ["creditInstallment"], children: [], sort: 60 },
  { key: "live_coupon", label: "ค่าบริการของคูปองไลฟ์คุ้ม", fields: ["liveCoupon"], children: [], sort: 70 },
  { key: "xtra_coupon", label: "ค่าบริการคูปอง Xtra", fields: ["xtraCoupon"], children: [], sort: 80 },
  { key: "eams", label: "ค่าบริการโปรแกรม EAMS", fields: ["eams"], children: [], sort: 90 },
  { key: "brand_campaign", label: "ค่าบริการแบรนด์ดัง ลดแรง/แฟลชเซล", fields: ["brandCampaign"], children: [], sort: 100 },
  { key: "paylater", label: "ค่าธรรมเนียมโปรแกรม TikTok PayLater", fields: ["paylater"], children: [], sort: 110 },
  { key: "growth", label: "ค่าธรรมเนียมสนับสนุนการเติบโตของร้านค้า", fields: ["growth"], children: [], sort: 120 },
  { key: "infrastructure", label: "ค่าธรรมเนียมโครงสร้างพื้นฐาน", fields: ["infrastructure"], children: [], sort: 130 },
  {
    key: "gmv_max_coupon",
    label: "คูปอง GMV Max",
    fields: ["gmvMaxCoupon", "gmvMaxCouponTax"],
    children: ["gmvMaxCoupon", "gmvMaxCouponTax"],
    sort: 140,
  },
  { key: "gmv_max_ads", label: "ค่าโฆษณา GMV Max", fields: ["gmvMaxAds"], children: [], sort: 150 },
  { key: "sfp", label: "ค่าธรรมเนียมการบริการ SFP", fields: ["sfpFee"], children: [], sort: 160 },
  { key: "bonus_refund", label: "ค่าธรรมเนียมบริการคืนเงินโบนัส", fields: ["bonusRefundService"], children: [], sort: 170 },
  { key: "campaign_resource", label: "ค่าทรัพยากรแคมเปญ", fields: ["campaignResource"], children: [], sort: 180 },
  { key: "preorder", label: "ค่าธรรมเนียมพรีออเดอร์", fields: ["preorder"], children: [], sort: 190 },
  { key: "guarantee_fee", label: "Guarantee program fee", fields: ["guaranteeFee"], children: [], sort: 200 },
];

export const FIELD_BY_KEY = new Map(FIELD_DEFS.map((f) => [f.key, f]));
export const FEE_GROUP_BY_KEY = new Map(FEE_GROUPS.map((g) => [g.key, g]));
export const FEE_PARENT_KEYS = new Set(
  FEE_GROUPS.flatMap((g) => g.fields),
);
export const FEE_CHILD_KEYS = new Set(FEE_GROUPS.flatMap((g) => g.children));

export function normalizeHeader(input: unknown): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function canonicalHeader(input: unknown): string {
  return normalizeHeader(input)
    .replace(/\s*\((?:โดยประมาณ|ประมาณ|estimated|approx\.?|approximately)\)\s*/gi, " ")
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*%\s*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface HeaderMatch {
  fieldKey: string;
  confidence: "exact" | "canonical" | "fuzzy";
  matchedAlias: string;
}

const exactAliasIndex = new Map<string, string>();
const canonicalAliasIndex = new Map<string, string>();
const fuzzyAliases: { alias: string; fieldKey: string }[] = [];

for (const field of FIELD_DEFS) {
  for (const alias of field.aliases) {
    const n = normalizeHeader(alias);
    if (!exactAliasIndex.has(n)) exactAliasIndex.set(n, field.key);
    const c = canonicalHeader(alias);
    if (c && !canonicalAliasIndex.has(c)) canonicalAliasIndex.set(c, field.key);
    const fc = canonicalHeader(alias);
    if (fc.length >= 6) fuzzyAliases.push({ alias: fc, fieldKey: field.key });
  }
}
fuzzyAliases.sort((a, b) => b.alias.length - a.alias.length);

export function matchHeader(header: string): HeaderMatch | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  const exact = exactAliasIndex.get(n);
  if (exact) return { fieldKey: exact, confidence: "exact", matchedAlias: n };

  const c = canonicalHeader(header);
  const canonical = canonicalAliasIndex.get(c);
  if (canonical) return { fieldKey: canonical, confidence: "canonical", matchedAlias: c };

  let best: { fieldKey: string; alias: string } | null = null;
  for (const candidate of fuzzyAliases) {
    if (!c.includes(candidate.alias) && !candidate.alias.includes(c)) continue;
    if (!best || candidate.alias.length > best.alias.length) {
      best = { fieldKey: candidate.fieldKey, alias: candidate.alias };
    }
  }
  if (!best) return null;
  return { fieldKey: best.fieldKey, confidence: "fuzzy", matchedAlias: best.alias };
}

export const MONEY_HEADER_HINTS = [
  "ค่าธรรมเนียม",
  "ค่าบริการ",
  "ค่าจัดส่ง",
  "ค่าคอม",
  "ค่าโฆษณา",
  "ภาษี",
  "ส่วนลด",
  "เงิน",
  "รายได้",
  "ชำระ",
  "ปรับ",
  "ชดเชย",
  "ยอด",
  "คูปอง",
  "coupon",
  "fee",
  "commission",
  "discount",
  "tax",
  "refund",
  "reimburs",
  "payout",
  "income",
  "amount",
  "shipping",
  "adjust",
  "subsidy",
  "charge",
];

export function isMoneyLikeHeader(header: string): boolean {
  const h = canonicalHeader(header);
  if (!h) return false;
  return MONEY_HEADER_HINTS.some((hint) => h.includes(hint.toLowerCase()));
}

export function isOrderType(value: string): boolean {
  const n = normalizeHeader(value);
  return ORDER_TYPE_LABELS.some((label) => n === normalizeHeader(label));
}
