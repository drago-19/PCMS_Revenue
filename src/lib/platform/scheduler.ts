import { runTikTokSync } from "./run-sync";
import { refreshDailySummary } from "./daily-summary";
import { syncStock } from "./stock";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "./store";

// รอบตั้งต้น 3 นาที — ตัวเลขขยับใกล้เวลาจริง แต่ละรอบยังเบา (ดึงย้อนไม่กี่ชั่วโมง)
const INTERVAL_MS = Number(process.env.PLATFORM_SYNC_INTERVAL_MS ?? 3 * 60 * 1000);
const FIRST_DELAY_MS = 20 * 1000;
// ดึงย้อนกว่ารอบหนึ่งช่วง เพื่อไม่ให้พลาดออเดอร์ที่สถานะเปลี่ยนช้า
const LOOKBACK_HOURS = Number(process.env.PLATFORM_SYNC_LOOKBACK_HOURS ?? 3);
// สต็อก: ดึงทั้งแคตตาล็อกใช้แค่ 2 คำขอต่อร้าน จึงตั้งรอบสั้น (60 วินาที) แยกจากออเดอร์
// รอบเต็มใช้เป็นตัวไล่เก็บ (reconcile) — ตั้งห่างไว้ เพราะเส้นทางหลักคือ webhook + หน้าจอ
const STOCK_INTERVAL_MS = Number(process.env.PLATFORM_STOCK_INTERVAL_MS ?? 30 * 60 * 1000);
// สรุปรายวันเป็นข้อมูลสรุป — คํานวณทุก 15 นาทีก็พอ
const SUMMARY_EVERY_TICKS = Math.max(1, Math.round((15 * 60 * 1000) / INTERVAL_MS));
let tickCount = 0;

let started = false;
let running = false;
let stockRunning = false;

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
    const to = Math.floor(Date.now() / 1000);
    const from = to - LOOKBACK_HOURS * 3600;
    try {
      const { stats } = await runTikTokSync({ from, to, kind: "scheduled" });
      console.log(
        `[scheduled-sync] ออเดอร์ ${stats.orders} · statement ${stats.statements} · เงินต่อออเดอร์ ${stats.orderFinance}`,
      );

      tickCount += 1;
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
          if (result.changed > 0) {
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
    } finally {
      stockRunning = false;
    }
  };

  setTimeout(tick, FIRST_DELAY_MS).unref();
  setInterval(tick, INTERVAL_MS).unref();
  setTimeout(stockTick, FIRST_DELAY_MS + 5000).unref();
  setInterval(stockTick, STOCK_INTERVAL_MS).unref();
  console.log(
    `[scheduled-sync] ออเดอร์ทุก ${Math.round(INTERVAL_MS / 1000)} วิ · สต็อกทุก ${Math.round(
      STOCK_INTERVAL_MS / 1000,
    )} วิ · ดึงย้อน ${LOOKBACK_HOURS} ชม. · ยิงพร้อมกันไม่เกิน ${process.env.TIKTOK_MAX_CONCURRENCY ?? 3} คำขอ`,
  );
}
