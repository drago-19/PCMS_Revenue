// TikTok ที่ยังไม่มีไฟล์รายได้ (transaction_type = 'คำสั่งซื้อ (OMS)') ต้องไม่มียอดเงิน —
// กฎเดิมตั้ง payout = ยอดขาย - ค่าส่งที่ร้านจ่าย ทำให้ยอดโอนรายวันเกินเงินที่ TikTok โอนจริง
// (1 พ.ย. 2026: ระบบ 19,135.15 vs ไฟล์ 11,214.15 → เกิน 7,921 จาก 52 แถว)
// สคริปต์นี้ปรับข้อมูลเดิมให้ตรงกฎใหม่; หลังรันต้องรัน scripts/rebuild-summaries.ts ต่อ
// ใช้: pnpm exec tsx --env-file-if-exists=.env scripts/zero-pending-tiktok-bill.ts
import { ensureSchema, getPool } from "../src/lib/db";

// ช่องเงินทุกช่องที่หน้าบิลอ่าน (src/lib/bill.ts) — ต้องเป็น 0 พร้อมกัน ไม่งั้นใบยังพิมพ์ตัวเลขเดิม
const ZERO_FIELDS = {
  incomeTotal: 0,
  customerPayment: 0,
  productAfterDiscount: 0,
  productBeforeDiscount: 0,
  storeDiscount: 0,
  shippingCustomerFee: 0,
  feeTotal: 0,
  shippingTotal: 0,
  shippingSellerTotal: 0,
  shippingActual: 0,
  shippingActualFee: 0,
  adjustment: 0,
  payout: 0,
  cogs: 0,
  shipnityProfit: 0,
};

async function main() {
  await ensureSchema();
  const pool = getPool();
  try {
    for (const schema of ["public", "seeheng"] as const) {
      const exists = await pool.query("SELECT to_regclass($1) AS t", [
        `${schema}.transactions`,
      ]);
      if (!exists.rows[0]?.t) {
        console.log(`[${schema}] ไม่มีตาราง transactions — ข้าม`);
        continue;
      }
      const before = await pool.query<{
        rows: string;
        payout: string;
      }>(
        `SELECT COUNT(*)::text AS rows, COALESCE(SUM(payout), 0)::text AS payout
           FROM ${schema}.transactions
          WHERE channel = 'TikTok' AND transaction_type = 'คำสั่งซื้อ (OMS)'`,
      );
      const updated = await pool.query<{ id: string }>(
        `UPDATE ${schema}.transactions
            SET income = 0,
                fee_total = 0,
                payout = 0,
                normalized_json = normalized_json
                  || jsonb_build_object(
                       'fields',
                       COALESCE(normalized_json->'fields', '{}'::jsonb) || $1::jsonb
                     )
                  || jsonb_build_object('feeGroups', '{}'::jsonb)
          WHERE channel = 'TikTok'
            AND transaction_type = 'คำสั่งซื้อ (OMS)'
            AND (income <> 0 OR fee_total <> 0 OR payout <> 0)
          RETURNING id`,
        [JSON.stringify(ZERO_FIELDS)],
      );
      console.log(
        `[${schema}] แถว TikTok รอไฟล์รายได้ ${before.rows[0]?.rows ?? "0"} แถว` +
          ` · ยอดที่เคยตั้งไว้ ${before.rows[0]?.payout ?? "0"} บาท → แก้ ${updated.rowCount} แถวเป็น 0`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
