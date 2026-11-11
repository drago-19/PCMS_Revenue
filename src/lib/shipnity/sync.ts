// ซิงก์ออเดอร์ Shipnity เข้าฐานข้อมูลของเรา (งานเบื้องหลัง)
//
// กติกา:
// - หน้าเว็บไม่ยิง Shipnity เอง — อ่านจากตาราง shipnity_orders (ดู store.ts)
// - รอบแรกของแต่ละบัญชี: ดึงชุดที่ยังไม่ปิดรายการทั้งหมดแล้วบันทึก
// - รอบถัดไป: ดึงชุดเดิมซ้ำทุก 2 นาที แต่เขียนเฉพาะแถวที่เปลี่ยน (content_hash)
// - ดูย้อนหลัง: ดึงเฉพาะออเดอร์ที่ปิดแล้วของวันนั้นครั้งเดียว แล้วเก็บไว้
// - ออเดอร์ที่ปิดแล้วและเก่ากว่า 7 วัน ถูกลบออกจากเซิร์ฟเวอร์ (Shipnity ยังมีข้อมูลอยู่)

import {
  OPEN_MAX_PAGES,
  PAY_LATER_MAX_PAGES,
  ShipnityError,
  listClosedOrdersForDay,
  listOpenOnly,
  listPayLaterOrders,
  type DayOrdersResult,
  type ShipnityOrder,
} from "@/lib/shipnity/client";
import type { ConnectedShipnityAccount } from "@/lib/shipnity/config";
import {
  countOpenStored,
  hasSyncedClosedDay,
  loadStoredOrders,
  markClosedDaySynced,
  pruneStoredOrders,
  readSyncState,
  saveStoredOrders,
  writeSyncState,
} from "@/lib/shipnity/store";

/**
 * ข้อมูลถือว่าสดภายในเวลานี้ — เปิดหน้าถี่ ๆ จึงไม่ยิง Shipnity ซ้ำ
 * ตั้ง 5 นาทีเพราะการไล่ทั้งกองทุก 2 นาทีทำให้ Shipnity จำกัดการเรียก (429) ทั้งบัญชี
 */
const FRESH_MS = 300_000;
/** หลังโดน 429 ครั้งแรกหยุด 2 นาที โดนซ้ำจะถอยร่นขึ้นเป็น 5 และ 15 นาที (ข้อมูลเก่ายังแสดงได้) */
const RATE_LIMIT_STEPS_MS = [120_000, 300_000, 900_000];
/** เพดานหน้าต่อการดึงหนึ่งครั้ง (15 ใบ/หน้า) — 60 หน้า = 900 ใบ เกินพอสำหรับร้านนี้ */
const SYNC_MAX_PAGES = Math.max(60, OPEN_MAX_PAGES);

interface SyncRuntime {
  inFlight: Map<string, Promise<number>>;
  pausedUntil: number;
  /** โดน 429 ติดกันกี่ครั้ง (ใช้เลือกเวลาถอยร่น) */
  rateLimitStreak: number;
  timer: ReturnType<typeof setInterval> | null;
}

const globalForSync = globalThis as unknown as { __shipnitySyncRuntime?: SyncRuntime };
const runtime: SyncRuntime = (globalForSync.__shipnitySyncRuntime ??= {
  inFlight: new Map(),
  pausedUntil: 0,
  rateLimitStreak: 0,
  timer: null,
});

function credentialsOf(account: ConnectedShipnityAccount) {
  return { email: account.email, token: account.token };
}

function isRateLimit(error: unknown): boolean {
  return error instanceof ShipnityError && error.status === 429;
}

/**
 * ดึงออเดอร์ที่ยังไม่ปิดรายการของบัญชีหนึ่งแล้วบันทึกลงฐานข้อมูล
 * คืนจำนวนแถวที่ถูกเขียนจริง (ไม่ใช่จำนวนที่ดึงมา)
 */
export async function syncOpenOrders(account: ConnectedShipnityAccount): Promise<number> {
  const inFlight = runtime.inFlight.get(account.id);
  if (inFlight) return inFlight;

  const task = (async () => {
    if (runtime.pausedUntil > Date.now()) {
      return 0;
    }

    try {
      const [open, payLater] = await Promise.all([
        listOpenOnly(credentialsOf(account), SYNC_MAX_PAGES),
        listPayLaterOrders(credentialsOf(account)),
      ]);

      const merged = new Map<number, ShipnityOrder>();
      for (const order of open) merged.set(order.id, order);
      for (const order of payLater) merged.set(order.id, order);
      const orders = [...merged.values()];

      const written = await saveStoredOrders(account.id, orders);
      await pruneStoredOrders(account.id);
      await writeSyncState(account.id, { orderCount: orders.length, lastError: null });
      runtime.rateLimitStreak = 0;
      return written;
    } catch (error) {
      if (isRateLimit(error)) {
        const step = RATE_LIMIT_STEPS_MS[Math.min(runtime.rateLimitStreak, RATE_LIMIT_STEPS_MS.length - 1)];
        runtime.rateLimitStreak += 1;
        runtime.pausedUntil = Date.now() + step;
      }
      const message = error instanceof Error ? error.message : "ซิงก์ไม่สำเร็จ";
      await writeSyncState(account.id, {
        orderCount: (await readSyncState(account.id))?.orderCount ?? 0,
        lastError: message,
      }).catch(() => {});
      throw error;
    }
  })().finally(() => {
    runtime.inFlight.delete(account.id);
  });

  runtime.inFlight.set(account.id, task);
  return task;
}

/** ดึงออเดอร์ที่ปิดแล้วของวันหนึ่ง (ครั้งเดียวต่อวัน) เพื่อดูย้อนหลังได้ */
export async function syncClosedDay(
  account: ConnectedShipnityAccount,
  isoDay: string,
): Promise<void> {
  if (await hasSyncedClosedDay(account.id, isoDay)) return;

  const key = `closed|${account.id}|${isoDay}`;
  const inFlight = runtime.inFlight.get(key);
  if (inFlight) {
    await inFlight.catch(() => {});
    return;
  }

  const task = (async () => {
    const closed = await listClosedOrdersForDay(credentialsOf(account), isoDay, SYNC_MAX_PAGES);
    await saveStoredOrders(account.id, closed);
    await markClosedDaySynced(account.id, isoDay);
    return closed.length;
  })().finally(() => {
    runtime.inFlight.delete(key);
  });

  runtime.inFlight.set(key, task);
  await task.catch(() => {});
}

export interface DayOrdersFromStore extends DayOrdersResult {
  /** แถวที่ถูกเขียนเพิ่ม/แก้ในการซิงก์ล่าสุด (0 = ไม่มีอะไรเปลี่ยน) */
  written: number;
  /** จำนวนออเดอร์ที่ดึงได้ในรอบซิงก์ล่าสุด (null = ยังไม่เคยซิงก์) */
  syncedCount: number | null;
  /** จำนวนออเดอร์ที่ยังไม่ปิดรายการที่มีในฐานข้อมูล */
  storedOpen: number;
}

/**
 * ออเดอร์ของวันหนึ่งจากฐานข้อมูล — ทางเดียวที่หน้าเว็บใช้
 * - ไม่มีข้อมูลในฐานข้อมูลเลย → ซิงก์รอเลย (ครั้งแรกของบัญชี)
 * - ข้อมูลเก่าเกิน 2 นาที → คืนข้อมูลเดิมทันที แล้วซิงก์ต่อในเบื้องหลัง
 */
export async function loadDayOrdersFromStore(
  account: ConnectedShipnityAccount,
  options: { isoDay: string; includeClosed: boolean },
): Promise<DayOrdersFromStore> {
  const state = await readSyncState(account.id);
  const stale = !state?.lastSyncAt || Date.now() - new Date(state.lastSyncAt).getTime() > FRESH_MS;
  let written = 0;

  if (!state) {
    written = await syncOpenOrders(account).catch(() => 0);
  } else if (stale) {
    void syncOpenOrders(account).catch(() => {});
  }

  if (options.includeClosed) {
    await syncClosedDay(account, options.isoDay).catch(() => {});
  }

  const stored = await loadStoredOrders(account.id, options.isoDay, {
    includeClosed: options.includeClosed,
  });
  const latest = await readSyncState(account.id);
  const storedOpen = await countOpenStored(account.id);

  return {
    orders: stored.orders,
    complete: true,
    // ใช้เวลาของรอบซิงก์ล่าสุด — ไม่ใช่เวลาที่แถวถูกเขียนล่าสุด (แถวที่ไม่เปลี่ยนจะค้างเวลาเก่า)
    fetchedAt: latest?.lastSyncAt ?? stored.fetchedAt ?? new Date().toISOString(),
    written,
    syncedCount: latest?.orderCount ?? null,
    storedOpen,
  };
}

/**
 * เปิดงานซิงก์เบื้องหลังของทุกบัญชี — เรียกซ้ำได้ ไม่สร้างตัวใหม่
 * ทุก 2 นาที: บัญชีที่ข้อมูลเก่าเกินกำหนดจะถูกดึงใหม่ (เขียนเฉพาะแถวที่เปลี่ยน)
 */
export function startShipnityBackgroundSync(accounts: readonly ConnectedShipnityAccount[]): void {
  if (runtime.timer || accounts.length === 0) return;

  runtime.timer = setInterval(() => {
    if (runtime.pausedUntil > Date.now()) return;
    for (const account of accounts) {
      void (async () => {
        const state = await readSyncState(account.id).catch(() => null);
        const stale =
          !state?.lastSyncAt || Date.now() - new Date(state.lastSyncAt).getTime() > FRESH_MS;
        if (!stale) return;
        await syncOpenOrders(account).catch(() => {});
      })();
    }
  }, FRESH_MS);

  // ไม่ให้ interval ค้างโปรเซสตอน build/ปิดเซิร์ฟเวอร์
  const handle = runtime.timer as unknown as { unref?: () => void };
  handle.unref?.();
}

export interface ForceSyncResult {
  account: string;
  /** จำนวนออเดอร์ที่ดึงได้ในรอบนี้ */
  fetched: number;
  /** ข้อความ error ของรอบนี้ (null = สำเร็จ) */
  error: string | null;
  /** ออเดอร์ที่ยังไม่ปิดรายการที่มีในฐานข้อมูล (เทียบกับ fetched เพื่อดูว่าดึงครบหรือไม่) */
  storedOpen: number;
}

/** บังคับซิงก์เดี๋ยวนี้ (ปุ่ม “ดึงใหม่เลย”) — ไม่ล้างข้อมูลเดิม และคืนผลของแต่ละบัญชี */
export async function forceSyncShipnity(
  accounts: readonly ConnectedShipnityAccount[],
): Promise<ForceSyncResult[]> {
  runtime.pausedUntil = 0;
  runtime.rateLimitStreak = 0;

  return Promise.all(
    accounts.map(async (account) => {
      try {
        await syncOpenOrders(account);
        const state = await readSyncState(account.id);
        return {
          account: account.label,
          fetched: state?.orderCount ?? 0,
          error: state?.lastError ?? null,
          storedOpen: await countOpenStored(account.id),
        };
      } catch (error) {
        return {
          account: account.label,
          fetched: 0,
          error: error instanceof Error ? error.message : "ซิงก์ไม่สำเร็จ",
          storedOpen: 0,
        };
      }
    }),
  );
}
