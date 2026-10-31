// ล็อกทะเบียนเลขที่ใบกำกับฯ (ครั้งเดียว/รันซ้ำได้) — ไม่เรียงเลขใหม่เด็ดขาด
// 1) ensureSchema: เพิ่มคอลัมน์ yymm/seq/channel/status + ตาราง audit + backfill จาก invoice_no เดิม
// 2) sync แบบทั้งระบบ: void บิลที่ไม่เข้าเงื่อนไข · ออกเลขต่อท้ายให้บิลที่ยังไม่มีเลข · เลขเดิมไม่เปลี่ยน
// สำรองตารางก่อนทุกครั้ง · ใช้: npx tsx --env-file=.env scripts/resync-invoice-registry.ts
import { ensureSchema, getPool } from "../src/lib/db";
import { syncMonthlyInvoiceRegistry } from "../src/lib/ingest/import-service";

const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    for (const schema of ["public", "seeheng"] as const) {
      const ok = await client.query("SELECT to_regclass($1) AS t", [`${schema}.invoice_registry`]);
      if (!ok.rows[0].t) continue;
      await client.query(`CREATE TABLE ${schema}.invoice_registry_backup_${stamp} AS SELECT * FROM ${schema}.invoice_registry`);
    }
    await ensureSchema();
    for (const schema of ["public", "seeheng"] as const) {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${schema === "public" ? "public" : "seeheng, public"}`);
      const before = await client.query(`SELECT order_id, invoice_no FROM invoice_registry WHERE seq IS NOT NULL`);
      await syncMonthlyInvoiceRegistry(client);
      const changed = await client.query(
        `SELECT COUNT(*)::int AS n FROM invoice_registry r
         JOIN unnest($1::text[], $2::text[]) AS b(order_id, invoice_no) ON b.order_id = r.order_id
         WHERE r.invoice_no <> b.invoice_no`,
        [before.rows.map((r) => r.order_id), before.rows.map((r) => r.invoice_no)],
      );
      if (changed.rows[0].n > 0) {
        throw new Error(`[${schema}] เลขเดิมถูกเปลี่ยน ${changed.rows[0].n} ใบ — ยกเลิกทั้งหมด`);
      }
      const summary = await client.query(`
        SELECT yymm, channel, status, MIN(seq) AS first_seq, MAX(seq) AS last_seq, COUNT(*)::int AS n
        FROM invoice_registry GROUP BY 1, 2, 3 ORDER BY 1 DESC, MIN(seq) LIMIT 12`);
      await client.query("COMMIT");
      console.log(`[${schema}] backup: ${schema}.invoice_registry_backup_${stamp} · เลขเดิมไม่เปลี่ยน ✅`);
      console.table(summary.rows);
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ล้มเหลว — rollback แล้ว:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
