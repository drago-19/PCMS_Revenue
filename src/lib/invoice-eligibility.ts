export const COMPENSATION_TX_TYPES = [
  "การชดเชยจากแพลตฟอร์ม",
  "เงินชดเชยด้านโลจิสติกส์",
] as const;

export function isCompensationTransactionType(
  txType: string | null | undefined,
): boolean {
  return (
    txType === "การชดเชยจากแพลตฟอร์ม" || txType === "เงินชดเชยด้านโลจิสติกส์"
  );
}

export function buildBillableCompensationSql(alias = "t"): string {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_order = 0 AND ${p}channel = 'TikTok' AND ${p}transaction_type IN ('การชดเชยจากแพลตฟอร์ม', 'เงินชดเชยด้านโลจิสติกส์') AND ${p}payout > 0)`;
}

export const BILLABLE_COMPENSATION_SQL = buildBillableCompensationSql("t");

export const BILLABLE_ORDER_OR_COMPENSATION_SQL = `(t.is_order = 1 OR ${BILLABLE_COMPENSATION_SQL})`;

/**
 * เงื่อนไขบิลที่ "ออกใบกำกับภาษีได้" (ใช้ร่วมกันทั้งการออกเลขที่และหน้าพิมพ์รวม)
 * — บิลขายปกติเท่านั้น: ไม่รวมคืนเงิน / ตีกลับ / ยกเลิก (income/payout ≤ 0)
 *   และบิลเปลี่ยนสินค้าไม่มีราคา (link_priority = 3)
 * — แยกเงื่อนไขตามช่องทางชัดเจน (AGENTS.md ข้อ 3):
 *   TikTok   : ต้องมีไฟล์ Settlement และข้อมูลครบทั้ง 3 ไฟล์ (link_priority = 0)
 *              รวมถึงรายการชดเชยจากแพลตฟอร์ม / โลจิสติกส์ ที่มียอดรับสุทธิเป็นบวก (payout > 0)
 *   Shopee   : บิลขายปกติ + ข้อมูลครบ 2 ไฟล์ Shipnity (link_priority = 0)
 *   Facebook : บิลขายปกติ + ต้องอยู่ในไฟล์สรุปจากฝ่ายบัญชี (accounting_import_id IS NOT NULL) และข้อมูลครบ (link_priority = 0; เปลี่ยนสินค้าไม่มีราคา = 3 ถูกตัดออก)
 *   LINE     : บิลขายปกติ + ต้องอยู่ในไฟล์สรุปจากฝ่ายบัญชี (accounting_import_id IS NOT NULL) และข้อมูลครบ (link_priority = 0)
 *   Other    : บิลขายปกติ + ข้อมูลครบ 2 ไฟล์ Shipnity (link_priority = 0)
 * ต้องใช้ alias `t` สำหรับตาราง transactions
 */
export const INVOICE_ELIGIBLE_SQL = `(
  (t.is_order = 1 AND t.channel = 'TikTok' AND t.transaction_type <> 'คำสั่งซื้อ (OMS)' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
  OR ${BILLABLE_COMPENSATION_SQL}
  OR (t.is_order = 1 AND t.channel = 'Shopee' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
  OR (t.is_order = 1 AND t.channel = 'Facebook' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0 AND EXISTS (SELECT 1 FROM oms_orders oa WHERE oa.order_uid = t.oms_order_uid AND oa.accounting_import_id IS NOT NULL))
  OR (t.is_order = 1 AND t.channel = 'Lazada' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
  OR (t.is_order = 1 AND t.channel = 'LINE' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0 AND EXISTS (SELECT 1 FROM oms_orders oa WHERE oa.order_uid = t.oms_order_uid AND oa.accounting_import_id IS NOT NULL))
  OR (t.is_order = 1 AND t.channel = 'Other' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
)`;
