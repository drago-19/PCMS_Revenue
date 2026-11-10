// Rebuild ตารางสรุปที่คำนวณล่วงหน้า (daily_summaries + sku_summaries) ทั้งระบบ — รันซ้ำได้ ไม่อันตราย
// ใช้หลัง deploy กฎ "แถว OMS ของ Shopee ยังไม่ใช่บิลจนกว่าจะมีไฟล์รายได้ Shopee"
// เพื่อให้ยอดสรุปเดิม (ที่เคยนับ Shopee OMS) ถูกคำนวณใหม่ทั้งตาราง
// ใช้: npx tsx --env-file=.env scripts/rebuild-summaries.ts
import { ensureSchema, getPool } from "../src/lib/db";
import { refreshSummaryTables } from "../src/lib/ingest/import-service";

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureSchema();
    for (const schema of ["public", "seeheng"] as const) {
      const ok = await client.query("SELECT to_regclass($1) AS t", [
        `${schema}.daily_summaries`,
      ]);
      if (!ok.rows[0].t) {
        console.log(`[${schema}] ไม่มีตาราง daily_summaries — ข้าม`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(
          `SET LOCAL search_path TO ${schema === "public" ? "public" : "seeheng, public"}`,
        );
        const before = await client.query(
          `SELECT COALESCE(SUM(order_count), 0)::int AS order_count,
                  COALESCE(SUM(shopee_count), 0)::int AS shopee_count
           FROM daily_summaries`,
        );
        await refreshSummaryTables(client);
        const after = await client.query(
          `SELECT COALESCE(SUM(order_count), 0)::int AS order_count,
                  COALESCE(SUM(shopee_count), 0)::int AS shopee_count
           FROM daily_summaries`,
        );
        await client.query("COMMIT");
        console.log(
          `[${schema}] order_count ${before.rows[0].order_count} → ${after.rows[0].order_count}` +
            ` · shopee_count ${before.rows[0].shopee_count} → ${after.rows[0].shopee_count} ✅`,
        );
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
  } catch (e) {
    console.error("ล้มเหลว — rollback แล้ว:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
