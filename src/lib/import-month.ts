const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export type ImportMonth = {
  /** YYYY-MM ตามที่ผู้ใช้เลือก */
  key: string;
  /** วันแรกของเดือน (YYYY-MM-01) */
  start: string;
  /** วันสุดท้ายของเดือน (YYYY-MM-DD) */
  end: string;
  /** ชื่อเดือนแบบไทย พ.ศ. สำหรับแสดงบนหน้าจอ */
  label: string;
};

/**
 * แปลง "YYYY-MM" เป็นช่วงวันที่ของเดือนนั้น — ใช้กรอง imports.period_start/period_end
 * ที่เก็บเป็น TEXT แบบ ISO (2026-11-01) จึงเทียบด้วยสตริงได้ตรง ๆ ไม่ต้อง cast เป็น date
 * คืน null เมื่อรูปแบบไม่ถูก เพื่อให้ผู้เรียกตอบ 400 แทนการเดาเดือนให้ผู้ใช้ลบข้อมูลผิดเดือน
 */
export function parseImportMonth(
  raw: string | null | undefined,
): ImportMonth | null {
  if (!raw) return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    key: `${match[1]}-${match[2]}`,
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
    label: `${THAI_MONTHS[month - 1]} ${year + 543}`,
  };
}
