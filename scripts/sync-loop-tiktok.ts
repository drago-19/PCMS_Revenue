// ตัวดึงข้อมูลอัตโนมัติ (เครื่อง dev): ทุก 10 นาที ดึง "วันนี้ + 7 วันย้อนหลัง" ของทุกร้านมาเขียนทับ
//
// ใช้: pnpm exec tsx --env-file=.env scripts/sync-loop-tiktok.ts
// หยุด: กด Ctrl+C หรือ kill process
//
// หมายเหตุ: ตัว client มีคิว + ถอยเมื่อถูกจำกัด (~2 คำขอ/วินาที) และกันลิมิตอยู่แล้ว
// รอบนี้ทำเฉพาะออเดอร์ + statement (พัสดุย้อนหลังใช้ไม่ได้เพราะการค้นไม่กรองวันที่)

import { getPlatformAccountRow, getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "../src/lib/platform/store";
import { finishSyncRun, startSyncRun, syncOrders, syncStatements, type SyncContext } from "../src/lib/platform/sync";

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 10 * 60 * 1000);
const LOOKBACK_DAYS = Number(process.env.SYNC_LOOKBACK_DAYS ?? 7);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp(): string {
  return new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}

async function cycle() {
  const config = await getPlatformConfig();
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM).then((rows) =>
    rows.filter((row) => row.status === "connected" && row.shopCipher),
  );
  if (!config.tiktok) {
    console.log(`[${stamp()}] ยังไม่ได้ตั้งค่าแอป TikTok — ข้ามรอบนี้`);
    return;
  }

  const to = Math.floor(Date.now() / 1000);
  const from = to - LOOKBACK_DAYS * 86400;

  for (const account of accounts) {
    const row = await getPlatformAccountRow(TIKTOK_PLATFORM, account.accountKey);
    if (!row?.accessToken || !row.shopCipher) {
      console.log(`[${stamp()}] ${account.shopName ?? account.accountKey}: ไม่มี token — ข้าม`);
      continue;
    }

    const ctx: SyncContext = {
      config: config.tiktok,
      accessToken: row.accessToken,
      shopCipher: row.shopCipher,
      shopId: account.accountKey,
    };

    const runId = await startSyncRun("TikTok", `auto ${LOOKBACK_DAYS}d`, new Date(from * 1000), new Date(to * 1000));
    try {
      const orders = await syncOrders(ctx, from, to);
      const money = await syncStatements(ctx, from, to);
      const changed = orders + money.statements + money.orderFinance;
      await finishSyncRun(runId, changed, null);

      // ถ้าไม่มีอะไรเปลี่ยน ให้บันทึกสั้น ๆ ว่าเงียบ ไม่ใช่ error
      console.log(
        changed === 0
          ? `[${stamp()}] ${account.shopName ?? account.accountKey}: ไม่มีข้อมูลใหม่ (รอรอบถัดไป)`
          : `[${stamp()}] ${account.shopName ?? account.accountKey}: ออเดอร์ ${orders} · statement ${money.statements} · รายการเงิน ${money.orderFinance}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishSyncRun(runId, 0, message);
      console.log(`[${stamp()}] ${account.shopName ?? account.accountKey}: ล้มเหลว — ${message}`);
    }
  }
}

async function main() {
  console.log(`เริ่มดึงอัตโนมัติทุก ${Math.round(INTERVAL_MS / 60000)} นาที · ย้อนหลัง ${LOOKBACK_DAYS} วัน`);
  for (;;) {
    try {
      await cycle();
    } catch (err) {
      console.log(`[${stamp()}] รอบนี้ล้มเหลว:`, err instanceof Error ? err.message : err);
    }
    await sleep(INTERVAL_MS);
  }
}

main();
