import assert from "node:assert/strict";
import test from "node:test";
import { ensureSchema, getPool } from "@/lib/db";
import {
  isShopHidden,
  listPlatformAccounts,
  pickActiveShopId,
  setShopHidden,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import { runTikTokSync, SyncUnavailableError } from "@/lib/platform/run-sync";
import { syncStock } from "@/lib/platform/stock";

// ร้านทดสอบของไฟล์นี้เท่านั้น — ลบทิ้งท้ายทุกเคส ไม่แตะร้านจริง
const SHOP = "test-hidden-shop-01";

async function upsertShop(hidden: boolean) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO platform_accounts (platform, account_key, shop_name, status, company_key, hidden)
     VALUES ($1, $2, $3, 'connected', 'dragon19', $4)
     ON CONFLICT (platform, account_key) DO UPDATE
       SET status = 'connected', hidden = EXCLUDED.hidden, updated_at = now()`,
    [TIKTOK_PLATFORM, SHOP, "TEST HIDDEN SHOP", hidden],
  );
}

async function cleanup() {
  await getPool().query(
    `DELETE FROM platform_accounts WHERE platform = $1 AND account_key = $2`,
    [TIKTOK_PLATFORM, SHOP],
  );
}

test("pickActiveShopId: ร้านที่เลือกไว้ใช้ได้เมื่อยังแสดงอยู่ ร้านที่หายไปถอยไปร้านแรกที่เชื่อมต่อ", () => {
  const accounts = [
    { accountKey: "a", status: "expired" },
    { accountKey: "b", status: "connected" },
  ];
  assert.equal(pickActiveShopId("a", accounts), "a");
  assert.equal(pickActiveShopId("b", accounts), "b");
  // ร้านที่เลือกไว้ถูกซ่อน/หลุดการเชื่อมต่อ → ถอยไปร้านที่เชื่อมต่ออยู่
  assert.equal(pickActiveShopId("hidden-shop", accounts), "b");
  assert.equal(pickActiveShopId(null, accounts), "b");
  // ไม่มีร้านที่แสดงอยู่เลย = ไม่มีร้านให้ใช้ (ไม่คืนรหัสของร้านที่ซ่อน)
  assert.equal(pickActiveShopId("hidden-shop", []), null);
});

test("ซ่อนร้านแล้วหลุดจากรายการที่แสดง แต่ยังอยู่ในรายการเต็มของหน้าตั้งค่า", async () => {
  await upsertShop(false);
  try {
    const before = await listPlatformAccounts(TIKTOK_PLATFORM, "active");
    assert.ok(before.some((account) => account.accountKey === SHOP));
    assert.equal(await isShopHidden(TIKTOK_PLATFORM, SHOP), false);

    await setShopHidden(TIKTOK_PLATFORM, SHOP, true);

    const after = await listPlatformAccounts(TIKTOK_PLATFORM, "active");
    assert.equal(after.some((account) => account.accountKey === SHOP), false);
    const all = await listPlatformAccounts(TIKTOK_PLATFORM, "all");
    assert.equal(all.some((account) => account.accountKey === SHOP), true);
    assert.equal(await isShopHidden(TIKTOK_PLATFORM, SHOP), true);

    // ตัวเลือกร้านใช้ไม่ได้กับร้านที่ซ่อน แม้จะถูกจำไว้เป็นร้านที่ใช้อยู่
    assert.notEqual(pickActiveShopId(SHOP, after), SHOP);

    await setShopHidden(TIKTOK_PLATFORM, SHOP, false);
    const shown = await listPlatformAccounts(TIKTOK_PLATFORM, "active");
    assert.ok(shown.some((account) => account.accountKey === SHOP));
  } finally {
    await cleanup();
  }
});

test("ร้านที่ซ่อน: ซิงก์ออเดอร์/statement และดึงสต็อกต้องไม่ยิงคำขอออกไป", async () => {
  await upsertShop(true);
  try {
    await assert.rejects(
      () => runTikTokSync({ from: 1, to: 2, kind: "test", shopId: SHOP }),
      (error: unknown) =>
        error instanceof SyncUnavailableError && /ถูกซ่อนอยู่/.test(error.message),
    );

    const stock = await syncStock(SHOP);
    assert.equal(stock.skus, 0);
    assert.equal(stock.changed, 0);
    assert.match(stock.error ?? "", /ถูกซ่อนอยู่/);
  } finally {
    await cleanup();
  }
});
