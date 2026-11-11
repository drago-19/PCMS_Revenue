// เก็บออเดอร์ Shipnity ไว้ในฐานข้อมูลของเรา
//
// เหตุผล: การเปิดหน้า /orders เดิมต้องไล่ดึง Shipnity ใหม่ทุกครั้ง (15 หน้า × 15 ใบ)
// ทำให้หน้าโหลดช้าและโดน 429 — ตอนนี้หน้าเว็บอ่านจากตารางนี้ ส่วนการดึงเป็นงานเบื้องหลัง
//
// การเขียน: upsert ทีละ 500 แถวในคำสั่งเดียว (unnest/jsonb_array_elements) และอัปเดตเฉพาะแถวที่เปลี่ยนจริง
// - content_hash เปลี่ยน = ข้อมูลธุรกิจเปลี่ยน (จ่าย/พิมพ์/ปิด ฯลฯ) → เขียนทับ
// - ออเดอร์ที่ยังไม่ปิดรายการ: refresh payload ด้วย เพื่อให้ URL รูปสินค้า (S3 เซ็นชื่อ มีอายุ 6 ชม.) ไม่หมดอายุค้าง

import { createHash } from "node:crypto";
import { query, queryOne } from "@/lib/db";
import type { ShipnityOrder } from "@/lib/shipnity/client";

const SAVE_BATCH_SIZE = 500;
const KEEP_CLOSED_DAYS = 7;

export interface StoredOrderValues {
  accountKey: string;
  orderId: number;
  invoiceNumber: string | null;
  createdAt: string;
  paid: boolean;
  printed: boolean;
  paymentAccepted: boolean;
  transferred: boolean;
  closed: boolean;
  cancelled: boolean;
  packed: boolean;
  orderBank: string | null;
  shippingType: string | null;
  price: number | null;
  contentHash: string;
  payload: ShipnityOrder;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** แฮชของข้อมูลที่ใช้ตัดสินใจ — ไม่รวม URL รูปที่เปลี่ยนทุกครั้งที่ดึง */
export function contentHashOf(order: ShipnityOrder): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        order.invoice_number ?? null,
        order.created_at ?? null,
        Boolean(order.paid),
        Boolean(order.printed),
        Boolean(order.payment_accepted),
        Boolean(order.transferred),
        Boolean(order.closed),
        Boolean(order.cancelled),
        Boolean(order.packed),
        order.order_bank ?? null,
        order.shipping_type ?? null,
        order.price ?? null,
        order.name ?? null,
        (order.purchases ?? []).map((purchase) => [purchase.code ?? null, purchase.name ?? null, purchase.quantity ?? null]),
      ]),
    )
    .digest("hex");
}

/** แปลงออเดอร์จาก API เป็นแถวที่จะบันทึก — คืน null ถ้าออเดอร์ไม่มีวันที่สร้างที่ใช้ได้ */
export function buildStoredOrder(accountKey: string, order: ShipnityOrder): StoredOrderValues | null {
  const createdAt = order.created_at ? new Date(order.created_at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

  return {
    accountKey,
    orderId: Number(order.id),
    invoiceNumber: order.invoice_number ?? null,
    createdAt: createdAt.toISOString(),
    paid: Boolean(order.paid),
    printed: Boolean(order.printed),
    paymentAccepted: Boolean(order.payment_accepted),
    transferred: Boolean(order.transferred),
    closed: Boolean(order.closed),
    cancelled: Boolean(order.cancelled),
    packed: Boolean(order.packed),
    orderBank: order.order_bank ?? null,
    shippingType: order.shipping_type ?? null,
    price: toNumberOrNull(order.price),
    contentHash: contentHashOf(order),
    payload: order,
  };
}

/**
 * บันทึกออเดอร์แบบ batch — คืนจำนวนแถวที่ถูกเขียนจริง (แถวที่ไม่เปลี่ยนจะถูกข้าม)
 */
export async function saveStoredOrders(
  accountKey: string,
  orders: readonly ShipnityOrder[],
): Promise<number> {
  const rows = orders
    .map((order) => buildStoredOrder(accountKey, order))
    .filter((row): row is StoredOrderValues => row !== null);

  let written = 0;
  for (let index = 0; index < rows.length; index += SAVE_BATCH_SIZE) {
    const batch = rows.slice(index, index + SAVE_BATCH_SIZE);
    const payload = batch.map((row) => ({
      orderId: row.orderId,
      invoiceNumber: row.invoiceNumber,
      createdAt: row.createdAt,
      paid: row.paid,
      printed: row.printed,
      paymentAccepted: row.paymentAccepted,
      transferred: row.transferred,
      closed: row.closed,
      cancelled: row.cancelled,
      packed: row.packed,
      orderBank: row.orderBank,
      shippingType: row.shippingType,
      price: row.price,
      contentHash: row.contentHash,
      payload: row.payload,
    }));

    const result = await query<{ written: number }>(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($2::jsonb) AS x(
           "orderId" BIGINT,
           "invoiceNumber" TEXT,
           "createdAt" TIMESTAMPTZ,
           paid BOOLEAN,
           printed BOOLEAN,
           "paymentAccepted" BOOLEAN,
           transferred BOOLEAN,
           closed BOOLEAN,
           cancelled BOOLEAN,
           packed BOOLEAN,
           "orderBank" TEXT,
           "shippingType" TEXT,
           price NUMERIC,
           "contentHash" TEXT,
           payload JSONB
         )
       ), upserted AS (
         INSERT INTO shipnity_orders (
           account_key, order_id, invoice_number, created_at, paid, printed, payment_accepted,
           transferred, closed, cancelled, packed, order_bank, shipping_type, price,
           content_hash, payload
         )
         SELECT
           $1, incoming."orderId", incoming."invoiceNumber", incoming."createdAt", incoming.paid,
           incoming.printed, incoming."paymentAccepted", incoming.transferred, incoming.closed,
           incoming.cancelled, incoming.packed, incoming."orderBank", incoming."shippingType",
           incoming.price, incoming."contentHash", incoming.payload
         FROM incoming
         ON CONFLICT (account_key, order_id) DO UPDATE SET
           invoice_number = EXCLUDED.invoice_number,
           created_at = EXCLUDED.created_at,
           paid = EXCLUDED.paid,
           printed = EXCLUDED.printed,
           payment_accepted = EXCLUDED.payment_accepted,
           transferred = EXCLUDED.transferred,
           closed = EXCLUDED.closed,
           cancelled = EXCLUDED.cancelled,
           packed = EXCLUDED.packed,
           order_bank = EXCLUDED.order_bank,
           shipping_type = EXCLUDED.shipping_type,
           price = EXCLUDED.price,
           content_hash = EXCLUDED.content_hash,
           payload = EXCLUDED.payload,
           last_synced_at = now()
         WHERE shipnity_orders.content_hash IS DISTINCT FROM EXCLUDED.content_hash
            OR (EXCLUDED.closed = false AND shipnity_orders.last_synced_at < now() - interval '3 hours')
         RETURNING 1
       )
       SELECT COUNT(*)::int AS written FROM upserted`,
      [accountKey, JSON.stringify(payload)],
    );

    written += result[0]?.written ?? 0;
  }

  return written;
}

export interface StoredDayOrders {
  orders: ShipnityOrder[];
  fetchedAt: string | null;
  count: number;
}

/**
 * อ่านออเดอร์ของวันหนึ่งจากฐานข้อมูล
 * - includeClosed = false (วันนี้): ออเดอร์ที่ยังไม่ปิดรายการทั้งหมด
 * - includeClosed = true (ย้อนหลัง): ของวันนั้นทุกสถานะ + ออเดอร์ที่ยังเปิดค้างอยู่
 */
export async function loadStoredOrders(
  accountKey: string,
  isoDay: string,
  options: { includeClosed: boolean },
): Promise<StoredDayOrders> {
  const rows = await query<{ payload: ShipnityOrder; last_synced_at: string | null }>(
    `SELECT payload, last_synced_at
     FROM shipnity_orders
     WHERE account_key = $1
       AND (
         closed = false
         OR ($2::boolean AND closed = true AND created_at >= $3::timestamptz AND created_at < ($3::timestamptz + interval '1 day'))
       )
     ORDER BY created_at DESC`,
    [accountKey, options.includeClosed, `${isoDay}T00:00:00+07:00`],
  );

  const fetchedAt = rows.reduce<string | null>((latest, row) => {
    if (!row.last_synced_at) return latest;
    const stamp = new Date(row.last_synced_at).toISOString();
    return !latest || stamp > latest ? stamp : latest;
  }, null);

  return {
    orders: rows.map((row) => row.payload),
    fetchedAt,
    count: rows.length,
  };
}

/** ลบออเดอร์ที่ปิดรายการแล้วและเก่ากว่า N วัน (ของที่ยังไม่ปิดรายการไม่ลบ) */
export async function pruneStoredOrders(
  accountKey: string,
  keepDays = KEEP_CLOSED_DAYS,
): Promise<number> {
  const rows = await query<{ account_key: string }>(
    `DELETE FROM shipnity_orders
     WHERE account_key = $1
       AND closed = true
       AND created_at < now() - make_interval(days => $2)
     RETURNING account_key`,
    [accountKey, keepDays],
  );
  return rows.length;
}

export interface ShipnitySyncState {
  lastSyncAt: string | null;
  orderCount: number;
  lastError: string | null;
}

export async function readSyncState(accountKey: string): Promise<ShipnitySyncState | null> {
  const row = await queryOne<{ last_sync_at: string | null; order_count: number; last_error: string | null }>(
    `SELECT last_sync_at, order_count, last_error FROM shipnity_sync_state WHERE account_key = $1`,
    [accountKey],
  );
  if (!row) return null;
  return {
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    orderCount: Number(row.order_count ?? 0),
    lastError: row.last_error,
  };
}

export async function writeSyncState(
  accountKey: string,
  values: { orderCount: number; lastError: string | null },
): Promise<void> {
  await query(
    `INSERT INTO shipnity_sync_state (account_key, last_sync_at, order_count, last_error)
     VALUES ($1, now(), $2, $3)
     ON CONFLICT (account_key) DO UPDATE SET
       last_sync_at = now(),
       order_count = EXCLUDED.order_count,
       last_error = EXCLUDED.last_error`,
    [accountKey, values.orderCount, values.lastError],
  );
}

/** วันที่ของออเดอร์ที่เคยดึงย้อนหลังมาแล้วหรือยัง */
export async function hasSyncedClosedDay(accountKey: string, isoDay: string): Promise<boolean> {
  const row = await queryOne<{ account_key: string }>(
    `SELECT account_key FROM shipnity_closed_days WHERE account_key = $1 AND iso_day = $2`,
    [accountKey, isoDay],
  );
  return row !== null;
}

export async function markClosedDaySynced(accountKey: string, isoDay: string): Promise<void> {
  await query(
    `INSERT INTO shipnity_closed_days (account_key, iso_day, synced_at)
     VALUES ($1, $2, now())
     ON CONFLICT (account_key, iso_day) DO UPDATE SET synced_at = now()`,
    [accountKey, isoDay],
  );
}
