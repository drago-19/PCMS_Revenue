/**
 * ทำงานครั้งเดียวตอน process ของเซิร์ฟเวอร์เริ่ม — ใช้เปิดตัวตั้งเวลาซิงก์ TikTok
 * (ไม่ต้องพึ่ง Task Scheduler ของเครื่อง และไม่ต้องมี session)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.PLATFORM_SYNC_DISABLED === "1") return;

  const { startScheduledSync } = await import("@/lib/platform/scheduler");
  startScheduledSync();
}
