// สรุปรายวันต่อร้านต่อแพลตฟอร์ม — เขียนทับช่วงที่ดึงล่าสุดครั้งเดียว
// หน้าภาพรวม/กราฟอ่านจากตารางนี้ได้แทนการ GROUP BY ตารางออเดอร์ทั้งก้อน (สำคัญเมื่อข้อมูลถึงหลักล้าน)

import { query } from "@/lib/db";

/**
 * คำนวณสรุปรายวันของร้านหนึ่ง ย้อนหลัง `days` วัน แล้ว upsert ครั้งเดียวทั้งช่วง
 * ใช้ค่าจากตารางออเดอร์ (จำนวน/ยกเลิก) และการเงิน (ยอดขาย/โอน/ค่าธรรมเนียม)
 */
export async function refreshDailySummary(shopId: string, days = 45): Promise<number> {
  const rows = await query<{ n: string }>(
    `INSERT INTO platform_daily_summary (shop_id, platform, day, orders, cancelled, revenue, settlement, fee)
     SELECT o.shop_id,
            o.platform,
            (o.create_time AT TIME ZONE 'Asia/Bangkok')::date AS day,
            count(*)::int,
            count(*) FILTER (WHERE o.order_status = 'CANCELLED')::int,
            COALESCE(sum(f.revenue_amount), 0),
            COALESCE(sum(f.settlement_amount), 0),
            COALESCE(sum(f.fee_and_tax_amount), 0)
       FROM platform_orders o
       LEFT JOIN platform_order_finance f
         ON f.platform = o.platform AND f.shop_id = o.shop_id AND f.order_id = o.order_id
      WHERE o.shop_id = $1
        AND o.create_time >= now() - ($2 || ' days')::interval
      GROUP BY 1, 2, 3
     ON CONFLICT (shop_id, platform, day) DO UPDATE
       SET orders = EXCLUDED.orders,
           cancelled = EXCLUDED.cancelled,
           revenue = EXCLUDED.revenue,
           settlement = EXCLUDED.settlement,
           fee = EXCLUDED.fee,
           updated_at = now()
     RETURNING 1 AS n`,
    [shopId, String(days)],
  );
  return rows.length;
}

export type DailySummaryRow = {
  day: string;
  orders: number;
  cancelled: number;
  revenue: number;
  settlement: number;
  fee: number;
};

/** อ่านสรุปรายวันที่คำนวณไว้แล้ว (ไม่แตะตารางออเดอร์) */
export async function getDailySummary(
  shopId: string,
  platform: string,
  fromDay: string,
  toDay: string,
): Promise<DailySummaryRow[]> {
  const rows = await query<{
    day: string;
    orders: number;
    cancelled: number;
    revenue: string;
    settlement: string;
    fee: string;
  }>(
    `SELECT day::text AS day, orders, cancelled, revenue::text, settlement::text, fee::text
       FROM platform_daily_summary
      WHERE shop_id = $1 AND platform = $2 AND day >= $3::date AND day <= $4::date
      ORDER BY day`,
    [shopId, platform, fromDay, toDay],
  );

  return rows.map((row) => ({
    day: row.day,
    orders: Number(row.orders ?? 0),
    cancelled: Number(row.cancelled ?? 0),
    revenue: Number(row.revenue ?? 0),
    settlement: Number(row.settlement ?? 0),
    fee: Number(row.fee ?? 0),
  }));
}
