// เทสรอบซิงก์ออเดอร์ Shipnity ของ scheduler แบบรันครั้งเดียว — ไม่ต้องเปิดหน้า /orders
// ใช้: pnpm exec tsx --env-file-if-exists=.env scripts/shipnity-sync-once.ts
// ปลดตัวปิดซิงก์ของเครื่อง dev เฉพาะรอบนี้ (autoSyncDisabled อ่านค่าตอนเรียก ไม่ใช่ตอน import)
process.env.SHIPNITY_SYNC_DISABLED = "0";

import { getStoredShipnityAccounts } from "@/lib/shipnity/config";
import { syncStaleShipnityAccounts } from "@/lib/shipnity/sync";
import { readSyncState } from "@/lib/shipnity/store";

async function snapshot(): Promise<unknown[]> {
  const { accounts } = await getStoredShipnityAccounts();
  const rows = [];
  for (const account of accounts) {
    const state = await readSyncState(account.id);
    rows.push({
      id: account.id,
      label: account.label,
      lastSyncAt: state?.lastSyncAt ?? null,
      orderCount: state?.orderCount ?? null,
      lastError: state?.lastError ?? null,
    });
  }
  return rows;
}

async function main() {
  console.log("ก่อนรัน:", JSON.stringify(await snapshot(), null, 2));
  await syncStaleShipnityAccounts();
  console.log("หลังรัน:", JSON.stringify(await snapshot(), null, 2));
}

main().catch((error) => {
  console.error("sync-once failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
