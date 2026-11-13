import { runTikTokSync } from "./run-sync";

// รอบตั้งต้น 3 นาที — ตัวเลขขยับใกล้เวลาจริง แต่ละรอบยังเบา (ดึงย้อนไม่กี่ชั่วโมง)
const INTERVAL_MS = Number(process.env.PLATFORM_SYNC_INTERVAL_MS ?? 3 * 60 * 1000);
const FIRST_DELAY_MS = 20 * 1000;
// ดึงย้อนกว่ารอบหนึ่งช่วง เพื่อไม่ให้พลาดออเดอร์ที่สถานะเปลี่ยนช้า
const LOOKBACK_HOURS = Number(process.env.PLATFORM_SYNC_LOOKBACK_HOURS ?? 3);

let started = false;
let running = false;

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
    } catch (error) {
      console.error(
        "[scheduled-sync] ล้มเหลว",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };

  setTimeout(tick, FIRST_DELAY_MS).unref();
  setInterval(tick, INTERVAL_MS).unref();
  console.log(
    `[scheduled-sync] เริ่มตัวตั้งเวลา (ทุก ${Math.round(INTERVAL_MS / 1000)} วินาที · ดึงย้อน ${LOOKBACK_HOURS} ชม. · ยิงพร้อมกันไม่เกิน ${process.env.TIKTOK_MAX_CONCURRENCY ?? 3} คำขอ)`,
  );
}
