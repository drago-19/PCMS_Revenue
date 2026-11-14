// เพิกถอน session เมื่อรหัสผ่านถูกเปลี่ยน
//
// เก็บ "เวลาที่รหัสผ่านเปลี่ยนล่าสุด" ต่อผู้ใช้ไว้ในหน่วยความจำ และอ่านค่าจริงจาก
// ฐานข้อมูลครั้งเดียวต่อโปรเซส (ตอนเริ่มระบบ/หลังดีพลอย) — การตรวจจึงยังอยู่ใน
// verifySessionToken ที่เป็น synchronous ไม่ต้องยิงฐานข้อมูลทุกคำขอ
//
// token ที่ออกก่อนเวลานั้นถือว่าใช้ไม่ได้ → เปลี่ยนรหัสผ่านแล้วอุปกรณ์อื่นหลุดทันที

const cutoffs = new Map<string, number>();

let seedPromise: Promise<void> | null = null;

function keyOf(username: string): string {
  return username.trim().toLowerCase();
}

/** เวลาที่รหัสผ่านเปลี่ยนล่าสุด (epoch วินาที) — null = ยังไม่เคยเปลี่ยน */
export function getSessionCutoff(username: string): number | null {
  return cutoffs.get(keyOf(username)) ?? null;
}

/** token ที่ออกก่อนเวลาเปลี่ยนรหัสผ่านใช้ไม่ได้ */
export function isSessionRevoked(username: string, issuedAtSeconds: number): boolean {
  const cutoff = getSessionCutoff(username);
  if (cutoff === null) return false;
  return issuedAtSeconds < cutoff;
}

/** เรียกหลังบันทึกรหัสผ่านใหม่สำเร็จ — ตัด token เก่าของผู้ใช้คนนี้ทันที */
export function notePasswordChanged(
  username: string,
  changedAtSeconds = Math.floor(Date.now() / 1000),
): void {
  const key = keyOf(username);
  const previous = cutoffs.get(key) ?? 0;
  cutoffs.set(key, Math.max(previous, changedAtSeconds));
}

/** อ่านเวลาเปลี่ยนรหัสผ่านจาก DB ครั้งเดียวต่อโปรเซส (เผื่อรีสตาร์ต/ดีพลอย) */
export function seedSessionCutoffs(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      const { query } = await import("./db");
      const rows = await query<{ username: string; cutoff: string | number | null }>(
        `SELECT username, EXTRACT(EPOCH FROM password_changed_at) AS cutoff
         FROM public.app_users`,
      );
      for (const row of rows) {
        const epochSeconds = Math.floor(Number(row.cutoff));
        if (!Number.isFinite(epochSeconds)) continue;
        const key = keyOf(row.username);
        if ((cutoffs.get(key) ?? 0) < epochSeconds) cutoffs.set(key, epochSeconds);
      }
    } catch {
      // อ่านไม่ได้ (ฐานข้อมูลยังไม่พร้อม) — ลองใหม่ในคำขอถัดไป
      seedPromise = null;
    }
  })();
  return seedPromise;
}
