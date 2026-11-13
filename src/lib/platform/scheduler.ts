import { runTikTokSync } from "./run-sync";

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_DELAY_MS = 60 * 1000;
// ดึงย้อนแค่ 12 ชม. ต่อรอบ — พอสำหรับออเดอร์ที่เพิ่งเกิด/เพิ่งเปลี่ยนสถานะ
const LOOKBACK_HOURS = 12;

let started = false;

/**
 * ตัวตั้งเวลาซิงก์ TikTok อยู่ใน process ของแอปเอง (ไม่ต้องพึ่ง Task Scheduler ของเครื่อง)
 * ทำงานทุก 15 นาที และเริ่มรอบแรกหลังบูต 1 นาที
 */
export function startScheduledSync(): void {
  if (started) return;
  started = true;

  const tick = async () => {
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
    }
  };

  setTimeout(tick, FIRST_DELAY_MS).unref();
  setInterval(tick, INTERVAL_MS).unref();
  console.log(
    `[scheduled-sync] เริ่มตัวตั้งเวลาแล้ว (ทุก ${INTERVAL_MS / 60000} นาที, ดึงย้อน ${LOOKBACK_HOURS} ชม.)`,
  );
}
