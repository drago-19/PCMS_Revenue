// แปลง query ของ /api/platform/tiktok/sync-now เป็นช่วงที่ runTikTokSync รับได้
// แยกออกมาเป็นฟังก์ชันล้วนเพื่อเทสต์ขอบเขตได้โดยไม่ต้องมี session หรือ DB

import type { SyncWindow } from "./run-sync";

const DEFAULT_LOOKBACK_HOURS = 36;
const MAX_LOOKBACK_HOURS = 36;
// กันการยิงช่วงกว้างในคำขอเดียว จนค้างหรือโดนจำกัดอัตรา
const MAX_BACKFILL_DAYS = 31;

export type SyncWindowRequest =
  | { ok: true; window: SyncWindow; wait: boolean }
  | { ok: false; error: string };

function parseDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function clampHours(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(MAX_LOOKBACK_HOURS, Math.max(1, Math.floor(value)));
}

/**
 * - ไม่ส่ง from: ดึงย้อน hours ชั่วโมง (สูงสุด 36) — ออเดอร์ที่ถูกแก้ไข
 * - ส่ง from (+ to): ดึงย้อนตามช่วงวัน ไม่เกิน 31 วัน
 *   mode=create (ค่าเริ่มต้น) = ออเดอร์ที่สร้างในช่วง · mode=update = ออเดอร์ที่ถูกแก้ไขในช่วง
 *   (ต้องมี update ด้วยเมื่อรอบซิงก์ขาดหายไปทั้งช่วง แล้วมีออเดอร์เก่าที่เปลี่ยนสถานะเฉพาะช่วงนั้น)
 */
export function parseSyncWindow(params: URLSearchParams, now: number): SyncWindowRequest {
  const fromDay = parseDay(params.get("from"));
  const toDay = parseDay(params.get("to"));
  const wait = params.get("wait") === "1";

  if (fromDay === null) {
    const hours = clampHours(params.get("hours"));
    return {
      ok: true,
      wait,
      window: { from: now - hours * 3600, to: now, kind: "sync-now", mode: "update" },
    };
  }

  if (toDay !== null && toDay <= fromDay) {
    return { ok: false, error: "ช่วงวันที่ไม่ถูกต้อง (ถึง ต้องอยู่หลัง จาก)" };
  }
  if ((toDay ?? now) - fromDay > MAX_BACKFILL_DAYS * 86400) {
    return { ok: false, error: `ดึงย้อนได้ครั้งละไม่เกิน ${MAX_BACKFILL_DAYS} วัน` };
  }

  const mode: "create" | "update" = params.get("mode") === "update" ? "update" : "create";
  return { ok: true, wait, window: { from: fromDay, to: toDay ?? now, kind: "backfill", mode } };
}
