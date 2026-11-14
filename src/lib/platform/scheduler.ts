import { runReturnsSync, runTikTokSync } from "./run-sync";
import { refreshDailySummary } from "./daily-summary";
import { runShopeeSync, syncShopeeStock } from "./shopee-sync";
import { shopeeNowSeconds } from "./shopee";
import { syncStock } from "./stock";
import { listPlatformAccounts, SHOPEE_PLATFORM, TIKTOK_PLATFORM } from "./store";
import { tikTokNowSeconds } from "./tiktok";

// รอบออเดอร์ทุก 60 วินาที — วัดจริง: ดึงย้อน 30 นาทีใช้ ~1.3 วิ (ออเดอร์ 97 แถว) ราคาถูกมาก
const INTERVAL_MS = Number(process.env.PLATFORM_SYNC_INTERVAL_MS ?? 60 * 1000);
const FIRST_DELAY_MS = 15 * 1000;
// ดึงย้อน 30 นาที = ได้ลองซ้ำ ~30 รอบก่อนหลุดหน้าต่าง (กันสถานะที่เปลี่ยนช้า/รอบที่ล้ม)
const LOOKBACK_MINUTES = Number(process.env.PLATFORM_SYNC_LOOKBACK_MINUTES ?? 30);
const LOOKBACK_HOURS = LOOKBACK_MINUTES / 60;
// statement ออกวันละครั้ง และการดึง 7 วันใช้ ~14 วิ — จึงดึงทุก 10 นาที ไม่ใช่ทุกรอบ
const STATEMENT_EVERY_TICKS = Math.max(1, Math.round((10 * 60 * 1000) / INTERVAL_MS));
// สต็อก: ดึงทั้งแคตตาล็อกใช้แค่ 2 คำขอต่อร้าน จึงตั้งรอบสั้น (60 วินาที) แยกจากออเดอร์
// รอบเต็มใช้เป็นตัวไล่เก็บ (reconcile) — ตั้งห่างไว้ เพราะเส้นทางหลักคือ webhook + หน้าจอ
const STOCK_INTERVAL_MS = Number(process.env.PLATFORM_STOCK_INTERVAL_MS ?? 30 * 60 * 1000);
// คำขอคืนสินค้าเปลี่ยนไม่บ่อยแต่ต้องเห็นเร็ว (ของถูกเปิดขายทันทีที่ plataform ปิดออเดอร์)
const RETURNS_INTERVAL_MS = Number(process.env.PLATFORM_RETURNS_INTERVAL_MS ?? 10 * 60 * 1000);
// สรุปรายวันเป็นข้อมูลสรุป — คํานวณทุก 15 นาทีก็พอ
const SUMMARY_EVERY_TICKS = Math.max(1, Math.round((15 * 60 * 1000) / INTERVAL_MS));
let tickCount = 0;

let started = false;
let running = false;
let stockRunning = false;
let returnsRunning = false;

/**
 * ตัวตั้งเวลาซิงก์ TikTok อยู่ใน process ของแอปเอง (ไม่ต้องพึ่ง Task Scheduler ของเครื่อง)
 * แต่ละรอบดึงย้อนช่วงสั้น ๆ แล้วเขียนลงฐานข้อมูลทีละหน้าอยู่แล้ว
 */
export function startScheduledSync(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    if (running) {
      console.log("[scheduled-sync] รอบก่อนยังไม่จบ — ข้ามรอบนี้");
      return;
    }
    running = true;
    tickCount += 1;
    const withStatements = tickCount === 1 || tickCount % STATEMENT_EVERY_TICKS === 0;
    const to = tikTokNowSeconds();
    const from = to - LOOKBACK_HOURS * 3600;
    try {
      const { stats } = await runTikTokSync({ from, to, kind: "scheduled", skipStatements: !withStatements });
      console.log(
        withStatements
          ? `[scheduled-sync] ออเดอร์ ${stats.orders} · statement ${stats.statements} · เงินต่อออเดอร์ ${stats.orderFinance}`
          : `[scheduled-sync] ออเดอร์ ${stats.orders} · เว้น statement รอบนี้`,
      );

      const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);

      // สรุปรายวัน: ทุก 15 นาที
      if (tickCount % SUMMARY_EVERY_TICKS === 0) {
        for (const account of accounts) {
          try {
            await refreshDailySummary(account.accountKey);
          } catch (error) {
            console.error(
              "[scheduled-sync] สรุปรายวันล้มเหลว",
              error instanceof Error ? error.message : error,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "[scheduled-sync] ล้มเหลว",
        error instanceof Error ? error.message : error,
      );
    }

    try {
      const shopeeAccounts = await listPlatformAccounts(SHOPEE_PLATFORM);
      const connectedShopee = shopeeAccounts.filter((a) => a.status === "connected");
      const shopeeTo = shopeeNowSeconds();
      const shopeeFrom = shopeeTo - LOOKBACK_HOURS * 3600;
      for (const account of connectedShopee) {
        try {
          const { stats } = await runShopeeSync({
            from: shopeeFrom,
            to: shopeeTo,
            kind: "scheduled",
            shopId: account.accountKey,
          });
          if (stats.orders > 0 || stats.orderFinance > 0) {
            console.log(
              `[scheduled-sync:shopee] ${account.accountKey} · ออเดอร์ ${stats.orders} · เงิน ${stats.orderFinance}`,
            );
          }
        } catch (err) {
          console.error(
            "[scheduled-sync:shopee] ล้มเหลว",
            account.accountKey,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } finally {
      running = false;
    }
  };

  // สต็อกมีรอบของตัวเอง — สั้นกว่าออเดอร์ เพราะราคาถูก (2 คำขอ) และคนดูสต็อกต้องการค่าล่าสุด
  const stockTick = async () => {
    if (stockRunning) return;
    stockRunning = true;
    try {
      const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
      for (const account of accounts) {
        try {
          const result = await syncStock(account.accountKey);
          if (result.error) {
            console.error("[stock-sync] ล้มเหลว", account.accountKey, result.error);
          } else if (result.changed > 0) {
            console.log(
              `[stock-sync] ${account.accountKey} · ${result.skus} SKU · เปลี่ยน ${result.changed} รายการ`,
            );
          }
        } catch (error) {
          console.error(
            "[stock-sync] ล้มเหลว",
            error instanceof Error ? error.message : error,
          );
        }
      }

      const shopeeAccounts = await listPlatformAccounts(SHOPEE_PLATFORM);
      for (const account of shopeeAccounts.filter((a) => a.status === "connected")) {
        try {
          const result = await syncShopeeStock(account.accountKey);
          if (result.changed > 0) {
            console.log(
              `[stock-sync:shopee] ${account.accountKey} · ${result.skus} SKU · เปลี่ยน ${result.changed} รายการ`,
            );
          }
        } catch (error) {
          console.error(
            "[stock-sync:shopee] ล้มเหลว",
            account.accountKey,
            error instanceof Error ? error.message : error,
          );
        }
      }
    } finally {
      stockRunning = false;
    }
  };

  // คำขอคืนสินค้า: รอบแรกคือดึงย้อน แล้วหลังจากนั้นดูเฉพาะที่เปลี่ยน
  const returnsTick = async () => {
    if (returnsRunning) return;
    returnsRunning = true;
    try {
      const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
      for (const account of accounts.filter((a) => a.status === "connected")) {
        try {
          const written = await runReturnsSync(account.accountKey);
          if (written > 0) {
            console.log(`[returns-sync] ${account.accountKey} · ${written} คำขอ`);
          }
        } catch (error) {
          console.error(
            "[returns-sync] ล้มเหลว",
            account.accountKey,
            error instanceof Error ? error.message : error,
          );
        }
      }
    } finally {
      returnsRunning = false;
    }
  };

  setTimeout(tick, FIRST_DELAY_MS).unref();
  setInterval(tick, INTERVAL_MS).unref();
  setTimeout(stockTick, FIRST_DELAY_MS + 5000).unref();
  setInterval(stockTick, STOCK_INTERVAL_MS).unref();
  setTimeout(returnsTick, FIRST_DELAY_MS + 10000).unref();
  setInterval(returnsTick, RETURNS_INTERVAL_MS).unref();
  console.log(
    `[scheduled-sync] ออเดอร์ทุก ${Math.round(INTERVAL_MS / 1000)} วิ (ดึงย้อน ${LOOKBACK_MINUTES} นาที) · statement ทุก ${
      STATEMENT_EVERY_TICKS * Math.round(INTERVAL_MS / 1000)
    } วิ · สต็อกทุก ${Math.round(STOCK_INTERVAL_MS / 1000)} วิ · คืนสินค้าทุก ${Math.round(
      RETURNS_INTERVAL_MS / 1000,
    )} วิ · ยิงพร้อมกันไม่เกิน ${
      process.env.TIKTOK_MAX_CONCURRENCY ?? 3
    } คำขอ`,
  );
}
