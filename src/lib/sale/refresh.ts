/**
 * โหลดหน้าเดิมใหม่จากเซิร์ฟเวอร์แบบเต็ม หลังแก้ข้อมูลสำเร็จ
 * ใช้แทน router.refresh() ในกรณีที่ป๊อปอัพที่เปิดค้างอยู่ไม่วาดข้อมูลใหม่ตาม
 * (ป๊อปอัพเปิดด้วย query param หน้าเดิมจึงกลับมาเปิดที่เดิม)
 */
export function scheduleHardRefresh(delayMs = 700): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.location.replace(window.location.href);
  }, delayMs);
}
