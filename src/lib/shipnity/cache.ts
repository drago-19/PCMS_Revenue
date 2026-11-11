// แคชผลการดึงออเดอร์ของ Shipnity ฝั่งเซิร์ฟเวอร์
//
// Shipnity จำกัดจำนวนคำขอ (429 "Too many requests ... wait for 120 seconds")
// หน้าคำสั่งซื้อจึงแยกแคชเป็นสองส่วน เพื่อให้การสลับวันที่ไม่ยิงซ้ำ:
// - "ออเดอร์ที่ยังไม่ส่ง" ไม่ขึ้นกับวันที่ → แคชชุดเดียวต่อบัญชี ใช้ร่วมทุกวัน
// - "ออเดอร์ที่ส่งแล้วของวันนั้น" → แคชแยกตามวัน และเก็บนานกว่าเพราะข้อมูลย้อนหลังไม่เปลี่ยน
//
// ระหว่างดึงอยู่ คำขออื่นรอผลเดียวกัน (ไม่ยิงซ้อน) และถ้าโดน 429 ระบบจะหยุดยิงชั่วคราว

import {
  OPEN_MAX_PAGES,
  SHIPNITY_PAGE_SIZE,
  ShipnityError,
  listClosedOrdersForDay,
  listOpenOnly,
  listPayLaterOrders,
  type DayOrdersResult,
  type ShipnityCredentials,
  type ShipnityOrder,
} from "@/lib/shipnity/client";

const OPEN_TTL_MS = 180_000;
const PAY_LATER_TTL_MS = 10 * 60_000;
const CLOSED_TTL_MS = 30 * 60_000;
const MAX_STALE_MS = 10 * 60_000;
const ERROR_BACKOFF_MS = 20_000;
const RATE_LIMIT_PAUSE_MS = 120_000;

interface Entry<T> {
  at: number;
  promise: Promise<T>;
  last: T | null;
  /** เวลาที่ได้ข้อมูล last มาจริง (ใช้ตัดสินว่ายังใช้ของเก่าได้ไหม) */
  lastAt: number | null;
}

const globalForCache = globalThis as unknown as {
  __shipnityMemo?: Map<string, Entry<unknown>>;
  __shipnityErrors?: Map<string, { at: number; error: unknown }>;
  __shipnityPausedUntil?: number;
};

const store = (globalForCache.__shipnityMemo ??= new Map<string, Entry<unknown>>());
const errors = (globalForCache.__shipnityErrors ??= new Map<string, { at: number; error: unknown }>());

function isRateLimit(error: unknown): boolean {
  return error instanceof ShipnityError && error.status === 429;
}

function pauseForRateLimit(): void {
  globalForCache.__shipnityPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
}

export function rateLimitPausedUntil(): number {
  return globalForCache.__shipnityPausedUntil ?? 0;
}

function assertNotPaused(): void {
  const until = rateLimitPausedUntil();
  if (until > Date.now()) {
    throw new ShipnityError(
      `Shipnity จำกัดจำนวนการเรียก — รออีกประมาณ ${Math.ceil((until - Date.now()) / 1000)} วินาที`,
      429,
    );
  }
}

async function memo<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;

  if (entry && now - entry.at < ttl) return entry.promise;

  const recentError = errors.get(key);
  if (recentError && now - recentError.at < ERROR_BACKOFF_MS) {
    if (entry?.last && now - (entry.lastAt ?? entry.at) < MAX_STALE_MS) return entry.last;
    throw recentError.error;
  }

  const promise = load()
    .then((result) => {
      errors.delete(key);
      const stamp = Date.now();
      store.set(key, {
        at: stamp,
        promise: Promise.resolve(result),
        last: result,
        lastAt: stamp,
      });
      return result;
    })
    .catch((error: unknown) => {
      errors.set(key, { at: Date.now(), error });
      if (isRateLimit(error)) pauseForRateLimit();

      // ถ้ามีข้อมูลล่าสุดอยู่แล้ว ให้ใช้ต่อแทนการทำให้หน้าพัง (เช่นตอน Shipnity ตอบ 429)
      if (entry?.last && Date.now() - (entry.lastAt ?? entry.at) < MAX_STALE_MS) {
        return entry.last as T;
      }

      if (entry) store.set(key, entry);
      else store.delete(key);
      throw error;
    });

  store.set(key, { at: now, promise, last: entry?.last ?? null, lastAt: entry?.lastAt ?? null });
  return promise;
}

export interface CachedDayOrdersOptions {
  credentials: ShipnityCredentials;
  isoDay: string;
  includeClosed: boolean;
  /** เพดานหน้าต่อการเรียกหนึ่งครั้ง (ปกติไม่ต้องส่ง) */
  maxPages?: number;
}

/**
 * ดึงออเดอร์ของวันหนึ่งผ่านแคช
 * สลับวันที่ไปมาถี่แค่ไหน คำขอ "ออเดอร์ที่ยังไม่ส่ง" จะถูกดึงครั้งเดียวต่อ TTL
 */
export async function loadDayOrdersCached(
  options: CachedDayOrdersOptions,
): Promise<DayOrdersResult> {
  const { credentials, isoDay, includeClosed } = options;
  assertNotPaused();

  // ออเดอร์ COD (pay_later) เปลี่ยนช้ากว่า จึงแคชแยกและนานกว่า
  const pageCap = options.maxPages ?? OPEN_MAX_PAGES;
  const [openOrders, payLaterOrders] = await Promise.all([
    memo(`open|${credentials.email}|${pageCap}`, OPEN_TTL_MS, () =>
      listOpenOnly(credentials, pageCap),
    ),
    memo(`paylater|${credentials.email}`, PAY_LATER_TTL_MS, () =>
      listPayLaterOrders(credentials),
    ),
  ]);

  const closedOrders = includeClosed
    ? await memo(`closed|${credentials.email}|${isoDay}`, CLOSED_TTL_MS, () =>
        listClosedOrdersForDay(credentials, isoDay, options.maxPages),
      )
    : [];

  const merged = new Map<number, ShipnityOrder>();
  for (const order of openOrders) merged.set(order.id, order);
  for (const order of payLaterOrders) merged.set(order.id, order);
  for (const order of closedOrders) merged.set(order.id, order);

  const cap = (options.maxPages ?? OPEN_MAX_PAGES) * SHIPNITY_PAGE_SIZE;
  const incomplete =
    openOrders.length >= cap || closedOrders.length >= cap || payLaterOrders.length >= 60;

  return {
    orders: [...merged.values()],
    complete: !incomplete,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * บังคับให้ดึงใหม่ในรอบถัดไป แต่ **ไม่ทิ้งข้อมูลเก่า**
 * ถ้า Shipnity ตอบ 429 หน้าเว็บจะยังแสดงข้อมูลล่าสุดพร้อมเวลาที่ดึงมา แทนที่จะขึ้นหน้าว่าง
 */
export function clearDayOrdersCache(): void {
  for (const [key, entry] of store.entries()) {
    store.set(key, { ...entry, at: 0 });
  }
  errors.clear();
  globalForCache.__shipnityPausedUntil = 0;
}
