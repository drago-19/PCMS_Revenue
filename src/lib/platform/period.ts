// ช่วงเวลากลางของหมวด platform — คำนวณที่เดียว เพื่อให้ทุกหน้าแสดงและส่งค่าช่วงเดียวกัน
// ค่าเริ่มต้น (URL ไม่มี from/to) = 30 วันย้อนหลัง เท่ากับที่ฝั่งข้อมูลใช้อยู่เดิม
// ห้ามคำนวณช่วงเวลาซ้ำในหน้าใดหน้าหนึ่งอีก ให้เรียกจากไฟล์นี้เท่านั้น

export const YEAR_START = "2026-01-01";

/** วันที่แบบ YYYY-MM-DD อิงเวลาท้องถิ่น สำหรับปุ่มเลือกช่วงเวลา */
export function isoDay(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function today(): string {
  return isoDay(new Date());
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
}

export function monthStart(): string {
  const date = new Date();
  date.setDate(1);
  return isoDay(date);
}

export function prevMonthStart(): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return isoDay(date);
}

export function prevMonthEnd(): string {
  const date = new Date();
  date.setDate(0);
  return isoDay(date);
}

export type PeriodPreset = {
  key: string;
  label: string;
  /** ไม่ระบุ = ใช้ค่าปริยายของฝั่งข้อมูล (ไม่ต้องส่ง from/to ไปใน URL) */
  from?: string;
  to?: string;
};

export const DEFAULT_PRESET_KEY = "30d";

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ช่วงเวลามาตรฐานของทุกหน้าในหมวดนี้ — คำนวณที่เดียว เพื่อให้ตัวเลขทุกหน้าตรงกัน
 * คืนค่าเป็นช่วงแบบ [start, end) คือ end ไม่ถูกรวม (SQL ใช้ >= start AND < end)
 *  - ระบุ to: จบที่เที่ยงคืนของวันถัดไป (เวลาไทย) → นับวันนั้นเต็มวัน
 *  - ไม่ระบุ to: จบที่ "ตอนนี้"
 *  - ระบุ from: เริ่มที่เที่ยงคืนของวันนั้น (เวลาไทย)
 *  - ไม่ระบุ from: ย้อนหลัง rangeDays วันจากจุดจบ
 */
export function resolveRange(
  from?: string,
  to?: string,
  rangeDays = 30,
): { startIso: string; endIso: string; fromDay: string; toDay: string } {
  const now = Date.now();
  const today = isoDay(new Date(now));
  const hasTo = Boolean(to && DAY_RE.test(to));
  // ปิดที่เที่ยงคืนของวันถัดไปเสมอ (เวลาไทย) → ตัวเลขนิ่งทั้งวันและทุกหน้าตรงกัน
  const endMs = new Date(`${hasTo ? (to as string) : today}T00:00:00+07:00`).getTime() + DAY_MS;
  const startMs =
    from && DAY_RE.test(from)
      ? new Date(`${from}T00:00:00+07:00`).getTime()
      : endMs - rangeDays * DAY_MS;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    fromDay: isoDay(new Date(startMs)),
    toDay: hasTo ? (to as string) : today,
  };
}

export function periodPresets(): PeriodPreset[] {
  return [
    { key: "today", label: "วันนี้", from: today(), to: today() },
    { key: "7d", label: "7 วัน", from: daysAgo(7) },
    { key: DEFAULT_PRESET_KEY, label: "30 วัน" },
    { key: "month", label: "เดือนนี้", from: monthStart() },
    { key: "prevmonth", label: "เดือนก่อน", from: prevMonthStart(), to: prevMonthEnd() },
    { key: "year", label: "ทั้งปี 69", from: YEAR_START },
  ];
}

/**
 * ป้ายที่ต้องติดอยู่ตอนนี้
 * ไม่มี from/to = 30 วัน (ค่าปริยาย) ไม่ปล่อยให้ไม่มีป้ายติดเลย
 * คืน null เมื่อเป็นช่วงที่ผู้ใช้เลือกเองด้วยปฏิทิน
 */
export function activePresetKey(from?: string, to?: string): string | null {
  if (!from && !to) return DEFAULT_PRESET_KEY;
  const found = periodPresets().find(
    (preset) => preset.from && preset.from === from && (preset.to ?? "") === (to ?? ""),
  );
  return found?.key ?? null;
}

/**
 * แปลงเวลาให้เป็น Date ที่ถูกต้อง
 * Postgres คืน timestamptz เป็น "2026-11-13 05:59:05.947848+00" (ช่องว่าง ไม่มี T, ออฟเซต 2 หลัก, ทศนิยม 6 ตำแหน่ง)
 * ซึ่ง new Date() ตรง ๆ ตีความผิด — เวลาบนหน้าจอจึงเพี้ยนไป 7 ชั่วโมง
 */
export function parseStamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** วันที่ย่อแบบไทย: 14 ต.ค. 69 */
export function thaiDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = value.length <= 10 ? parseStamp(`${value}T00:00:00`) : parseStamp(value);
  if (!date) return "—";
  // ระบุ timeZone ตรง ๆ: คอนเทนเนอร์บนเซิร์ฟเวอร์รันด้วย UTC ถ้าอิงเวลาเครื่องจะได้ 05:59 แทน 12:59
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

/** วันที่ + เวลาแบบไทย: 13/11/69 10:51 */
export function thaiDateTime(value: string | null | undefined): string {
  const date = parseStamp(value);
  if (!date) return "—";
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}

/** ช่วงวันที่แบบอ่านง่าย: 14 ต.ค. – 13 พ.ย. 69 */
export function thaiRange(fromIso: string | null | undefined, toIso: string | null | undefined): string {
  if (!fromIso || !toIso) return "—";
  return `${thaiDate(fromIso)} – ${thaiDate(toIso)}`;
}
