// ต่ออายุ access token ของ TikTok ก่อนหมดอายุ — จุดเดียวที่ทุกเส้นทางที่ยิง API ใช้ร่วมกัน
//
// ทำไมต้องมี: token อายุ 7 วัน และรอบซิงก์ (ออเดอร์ทุก 60 วิ, สต็อกทุก 15 วิ) ใช้ค่าใน DB ตรง ๆ
// 21 พ.ย. 2026 token หมดอายุแล้วไม่มีใครต่ออายุ → ซิงก์ล้ม 2,519 รอบติดกันด้วย "Expired credentials"
// จนข้อมูลขาดหายสองวัน เพราะวันหมดอายุที่เก็บไว้เพี้ยนเป็นปี 2083 (ดู parseTokenExpiry)

import {
  getPlatformAccountRow,
  getPlatformConfig,
  TIKTOK_PLATFORM,
  updateAccountTokens,
} from "./store";
import { refreshAccessToken } from "./tiktok";

/** ต่ออายุก่อนหมดจริง 5 นาที — รอบสต็อกห่างกัน 15 วิ token จึงไม่ทันหมดกลางรอบ */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** ต่ออายุไม่สำเร็จแล้วรอ 10 นาทีก่อนลองใหม่ — กันยิง refresh รัวทุก 15 วิ เมื่อ refresh token ตายแล้ว */
const REFRESH_RETRY_COOLDOWN_MS = 10 * 60 * 1000;

export type TikTokAccountCredentials = Awaited<ReturnType<typeof getPlatformAccountRow>>;

/**
 * access token ของ TikTok อยูได้นานสุด 7 วัน (14→21 พ.ย. 2026)
 * วันหมดอายุที่ไกลกว่านี้จึงเป็นค่าเพี้ยนจากการอ่าน expire_in ผิด — ต้องต่ออายุ ไม่ใช่เชื่อแล้วข้าม
 */
const MAX_PLAUSIBLE_TOKEN_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** token ใกล้หมดหรือไม่ — ไม่รู้วันหมดอายุ (null) หรือวันหมดอายุเพี้ยน ถือว่าต้องต่ออายุ */
export function tokenNeedsRefresh(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now(),
  marginMs: number = REFRESH_MARGIN_MS,
): boolean {
  if (!expiresAtIso) return true;
  const expiresAt = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresAt)) return true;
  if (expiresAt - nowMs > MAX_PLAUSIBLE_TOKEN_LIFE_MS) return true;
  return expiresAt - nowMs <= marginMs;
}

// รอบซิงก์หลายตัว (ออเดอร์/สต็อก/webhook) เรียกพร้อมกันได้ — รวมเป็นคำขอเดียวต่อร้าน
const inFlight = new Map<string, Promise<void>>();
const cooldownUntil = new Map<string, number>();

async function refreshAccount(accountKey: string, refreshToken: string): Promise<void> {
  try {
    const config = await getPlatformConfig();
    if (!config.tiktok) return;
    const refreshed = await refreshAccessToken(config.tiktok, refreshToken);
    await updateAccountTokens({
      platform: TIKTOK_PLATFORM,
      accountKey,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
    });
    cooldownUntil.delete(accountKey);
  } catch (error) {
    // ต่ออายุไม่ได้ (refresh token ตาย/ถูกเพิกถอน) → ต้องให้ร้าน authorize ใหม่
    // คืน token เดิมให้ผู้เรียกยิงต่อ แล้วปล่อยให้ error ของ TikTok ขึ้นตามปกติในผลซิงก์
    cooldownUntil.set(accountKey, Date.now() + REFRESH_RETRY_COOLDOWN_MS);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[token] ต่ออายุ token ของร้าน ${accountKey} ไม่สำเร็จ: ${message}`);
  }
}

/**
 * อ่านบัญชี TikTok พร้อมต่ออายุ token ให้ถ้าใกล้หมดอายุ
 * คืนค่า null เมื่อไม่พบร้าน — เหมือน getPlatformAccountRow
 */
export async function getFreshTikTokAccount(accountKey: string): Promise<TikTokAccountCredentials> {
  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, accountKey);
  if (!row?.accessToken || !row.refreshToken) return row;
  if (!tokenNeedsRefresh(row.accessTokenExpiresAt)) return row;
  if ((cooldownUntil.get(accountKey) ?? 0) > Date.now()) return row;

  const running = inFlight.get(accountKey);
  if (running) {
    await running.catch(() => undefined);
    return getPlatformAccountRow(TIKTOK_PLATFORM, accountKey);
  }

  const task = refreshAccount(accountKey, row.refreshToken);
  inFlight.set(accountKey, task);
  try {
    await task;
  } finally {
    inFlight.delete(accountKey);
  }
  return getPlatformAccountRow(TIKTOK_PLATFORM, accountKey);
}
