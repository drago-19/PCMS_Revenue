/**
 * เงื่อนไขบิลที่ "ออกใบกำกับภาษีได้" (ใช้ร่วมกันทั้งการออกเลขที่และหน้าพิมพ์รวม)
 * — บิลขายปกติเท่านั้น: ไม่รวมคืนเงิน / ตีกลับ / ยกเลิก (income/payout ≤ 0)
 *   และบิลเปลี่ยนสินค้าไม่มีราคา (link_priority = 3)
 * — แยกเงื่อนไขตามช่องทางชัดเจน (AGENTS.md ข้อ 3):
 *   TikTok   : ต้องมีไฟล์ Settlement และข้อมูลครบทั้ง 3 ไฟล์ (link_priority = 0)
 *   Shopee   : บิลขายปกติ + ข้อมูลครบ 2 ไฟล์ Shipnity (link_priority = 0)
 *   Facebook : บิลขายปกติ + ข้อมูลครบ 2 ไฟล์ Shipnity (link_priority = 0; เปลี่ยนสินค้าไม่มีราคา = 3 ถูกตัดออก)
 * ต้องใช้ alias `t` สำหรับตาราง transactions
 */
export const INVOICE_ELIGIBLE_SQL = `t.is_order = 1 AND (
  (t.channel = 'TikTok' AND t.transaction_type <> 'คำสั่งซื้อ (OMS)' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
  OR (t.channel = 'Shopee' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
  OR (t.channel = 'Facebook' AND t.link_priority = 0 AND t.income > 0 AND t.payout > 0)
)`;
