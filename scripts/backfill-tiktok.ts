// ดึงข้อมูล TikTok ย้อนหลังลงฐานข้อมูลเรา (ใช้ในเครื่อง dev ก่อน — ยังไม่ต้อง deploy)
//
// ตัวอย่าง:
//   pnpm exec tsx --env-file=.env scripts/backfill-tiktok.ts 2026-01-01
//   pnpm exec tsx --env-file=.env scripts/backfill-tiktok.ts 2026-01-01 2026-01-31
//
// หมายเหตุ: ใช้ token/สิทธิ์ของร้านที่เชื่อมไว้ในเครื่องนี้ และเขียนลงตาราง platform_* เท่านั้น

import fs from "node:fs";
import pg from "pg";
import { getPlatformAccountRow, getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "../src/lib/platform/store";
import {
  finishSyncRun,
  startSyncRun,
  syncOrders,
  syncStatements,
  type SyncContext,
} from "../src/lib/platform/sync";

const WINDOW_DAYS = 7; // ช่วงต่อครั้งของออเดอร์/พัสดุ (กันคำขอค้างนานและกันหน่วยความจำบวม)

function startOfUtcDay(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
}

function endOfUtcDay(iso: string): number {
  return Math.floor(new Date(`${iso}T23:59:59Z`).getTime() / 1000) + 1;
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function main() {
  const password = fs.readFileSync(".env", "utf8").match(/^SUPABASE_POSTGRES_PASSWORD=(.*)$/m)?.[1]?.trim();
  if (!password) throw new Error("ไม่พบรหัสผ่านฐานข้อมูลใน .env");

  const [fromArg, toArg] = process.argv.slice(2);
  if (!fromArg) {
    console.error("ใช้: tsx scripts/backfill-tiktok.ts <วันที่เริ่ม YYYY-MM-DD> [วันที่สิ้นสุด YYYY-MM-DD]");
    process.exit(1);
  }

  const fromUnix = startOfUtcDay(fromArg);
  const toUnix = toArg ? endOfUtcDay(toArg) : Math.floor(Date.now() / 1000);

  const config = await getPlatformConfig();
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const account = accounts.find((row) => row.status === "connected" && row.shopCipher);
  if (!config.tiktok || !account) throw new Error("ยังไม่มีร้าน TikTok ที่เชื่อมในเครื่องนี้");

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, account.accountKey);
  if (!row?.accessToken || !row.shopCipher) throw new Error("ไม่พบ token ของร้าน");

  const ctx: SyncContext = {
    config: config.tiktok,
    accessToken: row.accessToken,
    shopCipher: row.shopCipher,
    shopId: account.accountKey,
  };

  console.log(
    `เริ่มดึง ${isoDate(fromUnix)} → ${isoDate(toUnix)} · ร้าน ${account.shopName ?? account.accountKey}`,
  );

  let totalStatements = 0;
  let totalFinance = 0;
  let totalOrders = 0;
  let totalPackages = 0;

  // statement ดึงเป็นช่วงเดือน (จำนวนแถวน้อย) — ที่เหลือดึงทีละ WINDOW_DAYS วัน
  const monthFrom = new Date(fromUnix * 1000);
  monthFrom.setUTCDate(1);

  for (let cursor = fromUnix; cursor < toUnix; ) {
    const windowTo = Math.min(cursor + WINDOW_DAYS * 86400, toUnix);
    const label = `${isoDate(cursor)} → ${isoDate(windowTo)}`;
    const runId = await startSyncRun("TikTok", `backfill ${label}`, new Date(cursor * 1000), new Date(windowTo * 1000));
    try {
      const orders = await syncOrders(ctx, cursor, windowTo);
      totalOrders += orders;
      // หมายเหตุ: ไม่ดึงพัสดุย้อนหลัง เพราะการค้นพัสดุไม่กรองตามวันที่ (ได้ชุดล่าสุดซ้ำ)
      // สถานะขนส่ง/เลขพัสดุใช้จากออเดอร์แทน
      await finishSyncRun(runId, orders, null);
      console.log(`  ✓ ${label}: ออเดอร์ ${orders}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishSyncRun(runId, 0, message);
      console.error(`  ✗ ${label}: ${message}`);
      throw err;
    }
    cursor = windowTo;
    // เว้นจังหวะระหว่างช่วง เพื่อไม่ให้เป็นการยิงต่อเนื่องแบบ burst
    if (cursor < toUnix) await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // statement ทั้งช่วงครั้งเดียว (API รองรับช่วงกว้าง + แบ่งหน้าเอง)
  const statementRun = await startSyncRun("TikTok", "statements", new Date(fromUnix * 1000), new Date(toUnix * 1000));
  try {
    const result = await syncStatements(ctx, fromUnix, toUnix);
    totalStatements += result.statements;
    totalFinance += result.orderFinance;
    await finishSyncRun(statementRun, result.statements + result.orderFinance, null);
    console.log(`  ✓ statements: ${result.statements} ใบ · รายการเงินต่อออเดอร์ ${result.orderFinance} แถว`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(statementRun, 0, message);
    console.error(`  ✗ statements: ${message}`);
  }

  // สรุปจากฐานข้อมูลจริง
  const db = new pg.Client({
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password,
    database: "pcms_revenue",
  });
  await db.connect();
  try {
    const summary = await db.query(
      `SELECT
         (SELECT count(*) FROM platform_orders)::text AS orders,
         (SELECT count(*) FROM platform_order_items)::text AS items,
         (SELECT count(*) FROM platform_packages)::text AS packages,
         (SELECT count(*) FROM platform_statements)::text AS statements,
         (SELECT count(*) FROM platform_order_finance)::text AS finance,
         pg_size_pretty(pg_total_relation_size('platform_orders')) AS orders_size`,
    );
    console.log("สรุปในฐานข้อมูล:", JSON.stringify(summary.rows[0]));
  } finally {
    await db.end();
  }

  console.log(
    `เสร็จ: ดึงรอบนี้ ออเดอร์ ${totalOrders} · พัสดุ ${totalPackages} · statement ${totalStatements} · รายการเงิน ${totalFinance}`,
  );
}

main().catch((err) => {
  console.error("ไม่สำเร็จ:", err instanceof Error ? err.message : err);
  process.exit(1);
});
