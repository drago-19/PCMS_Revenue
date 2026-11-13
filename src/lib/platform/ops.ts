// ตัวเลข "ปฏิบัติการขาย" และ "สินค้า" จากข้อมูล TikTok ที่เก็บไว้แล้วเท่านั้น
//
// ทุกตัวเลขมาจากตาราง platform_* ในช่วงวันที่เดียวกับแดชบอร์ด
// ไม่พึ่ง Shipnity: ต้นทุนสินค้ายังไม่มีในฐานข้อมูล (cost_price = 0 ทุก SKU)
// จึงคิดได้ถึง "กำไรขั้นต้นหลังค่าธรรมเนียม/ค่าส่ง" เท่านั้น

import { query } from "@/lib/db";

export interface OpsOrderRow {
  orderId: string;
  status: string;
  dueAt: string | null;
  hoursLate: number;
  amount: number;
  province: string | null;
  tracking: string | null;
}

export interface OpsCountRow {
  label: string;
  count: number;
  rate: number;
}

export interface OpsProductRow {
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
  image: string | null;
}

export interface OpsCancelProductRow {
  name: string;
  sold: number;
  cancelled: number;
  rate: number;
  image: string | null;
}

export interface OpsStuckRow {
  tracking: string;
  carrier: string | null;
  status: string;
  idleDays: number;
}

export interface TikTokOps {
  range: { from: string; to: string };
  overdue: { count: number; rows: OpsOrderRow[] };
  noTracking: { count: number; rows: OpsOrderRow[] };
  stuck: { count: number; rows: OpsStuckRow[] };
  cancels: {
    total: number;
    cancelled: number;
    rate: number;
    byInitiator: OpsCountRow[];
    byReason: OpsCountRow[];
    byProvince: OpsCountRow[];
  };
  products: {
    top: OpsProductRow[];
    dropped: OpsProductRow[];
    byCancel: OpsCancelProductRow[];
  };
  price: { units: number; avgSale: number; avgList: number };
}

export interface OpsParams {
  from?: string | null;
  to?: string | null;
  shopId?: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** เวลาที่ TikTok ให้มาว่าต้องส่งภายในเมื่อไร (วินาที) — ถ้าไม่มีให้ใช้ 48 ชม.หลังชำระ */
const DUE_UNIX = `COALESCE(
  CASE WHEN o.raw_json->>'tts_sla_time' ~ '^[0-9]+$' THEN (o.raw_json->>'tts_sla_time')::bigint END,
  CASE WHEN o.raw_json->>'shipping_due_time' ~ '^[0-9]+$' THEN (o.raw_json->>'shipping_due_time')::bigint END,
  EXTRACT(EPOCH FROM COALESCE(o.paid_time, o.create_time))::bigint + 172800
)`;

const UNSHIPPED = "('AWAITING_SHIPMENT','ON_HOLD','PARTIALLY_SHIPPING','AWAITING_COLLECTION')";

export async function getTikTokOps(params: OpsParams): Promise<TikTokOps> {
  const to = params.to && DAY_RE.test(params.to) ? params.to : isoDay(new Date());
  const from =
    params.from && DAY_RE.test(params.from)
      ? params.from
      : dayOffset(-30);

  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);
  const spanMs = Math.max(end.getTime() - start.getTime(), 86_400_000);
  const prevStart = new Date(start.getTime() - spanMs);

  const shopClause = params.shopId ? " AND shop_id = $3::text" : "";
  const base = params.shopId
    ? [start.toISOString(), end.toISOString(), params.shopId]
    : [start.toISOString(), end.toISOString()];

  const [
    overdueRows,
    noTrackingRows,
    stuckRows,
    cancelTotals,
    cancelInitiators,
    cancelReasons,
    cancelProvinces,
    topProducts,
    droppedProducts,
    cancelProducts,
    priceRows,
  ] = await Promise.all([
    // ค้างส่งเกินกำหนด: สถานะยังไม่จัดส่ง และเวลาที่ต้องส่งผ่านไปแล้ว
    query<{
      order_id: string;
      order_status: string;
      due_at: string;
      late_seconds: string;
      total_amount: string;
      province: string | null;
      tracking_number: string | null;
    }>(
      `WITH base AS (
         SELECT order_id, order_status, paid_time, create_time, total_amount, province,
                COALESCE(NULLIF(btrim(tracking_number), ''), NULLIF(btrim(raw_json->>'tracking_number'), '')) AS tracking_number,
                ${DUE_UNIX} AS due_unix
           FROM platform_orders o
          WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz
            AND order_status IN ${UNSHIPPED}${shopClause}
       )
       SELECT order_id, order_status, to_timestamp(due_unix)::text AS due_at,
              (EXTRACT(EPOCH FROM now()) - due_unix)::text AS late_seconds,
              total_amount::text, province, tracking_number
         FROM base
        WHERE due_unix < EXTRACT(EPOCH FROM now())
        ORDER BY (EXTRACT(EPOCH FROM now()) - due_unix) DESC
        LIMIT 200`,
      base,
    ),
    // ยังไม่มีเลขพัสดุ ทั้งที่ควรมีแล้ว
    query<{
      order_id: string;
      order_status: string;
      due_at: string;
      late_seconds: string;
      total_amount: string;
      province: string | null;
      tracking_number: string | null;
    }>(
      `WITH base AS (
         SELECT order_id, order_status, paid_time, create_time, total_amount, province,
                COALESCE(NULLIF(btrim(tracking_number), ''), NULLIF(btrim(raw_json->>'tracking_number'), '')) AS tracking_number,
                ${DUE_UNIX} AS due_unix
           FROM platform_orders o
          WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz
            AND order_status IN ('AWAITING_COLLECTION','IN_TRANSIT','PARTIALLY_SHIPPING')${shopClause}
       )
       SELECT order_id, order_status, to_timestamp(due_unix)::text AS due_at,
              (EXTRACT(EPOCH FROM now()) - due_unix)::text AS late_seconds,
              total_amount::text, province, tracking_number
         FROM base
        WHERE tracking_number IS NULL
        ORDER BY 4 DESC
        LIMIT 200`,
      base,
    ),
    // พัสดุที่ยังไม่ถึงมือ buyer และไม่ขยับเกิน 3 วัน
    query<{
      tracking_number: string;
      shipping_provider: string | null;
      status: string;
      idle_days: string;
    }>(
      `SELECT COALESCE(NULLIF(tracking_number, ''), package_id) AS tracking_number,
              shipping_provider, COALESCE(status, 'ไม่ทราบสถานะ') AS status,
              (EXTRACT(EPOCH FROM now() - COALESCE(update_time, create_time)) / 86400)::text AS idle_days
         FROM platform_packages
        WHERE COALESCE(status, '') NOT IN ('DELIVERED','COMPLETED','CANCELLED','RETURNED','LOST')
          AND COALESCE(update_time, create_time) < now() - interval '3 days'
          AND create_time >= $1::timestamptz AND create_time < $2::timestamptz
          ${params.shopId ? " AND shop_id = $3::text" : ""}
        ORDER BY EXTRACT(EPOCH FROM now() - COALESCE(update_time, create_time)) DESC
        LIMIT 200`,
      base,
    ),
    query<{ total: string; cancelled: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE order_status = 'CANCELLED')::text AS cancelled
         FROM platform_orders
        WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz${shopClause}`,
      base,
    ),
    query<{ label: string; n: string }>(
      `SELECT COALESCE(NULLIF(o.raw_json->>'cancellation_initiator', ''), 'ไม่ระบุ') AS label,
              count(*)::text AS n
         FROM platform_orders o
        WHERE o.create_time >= $1::timestamptz AND o.create_time < $2::timestamptz
          AND o.order_status = 'CANCELLED'${shopClause.replace("shop_id", "o.shop_id")}
        GROUP BY 1 ORDER BY 2 DESC`,
      base,
    ),
    query<{ label: string; n: string }>(
      `SELECT COALESCE(NULLIF(cancel_reason, ''), 'ไม่ระบุเหตุผล') AS label, count(*)::text AS n
         FROM platform_orders
        WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz
          AND order_status = 'CANCELLED'${shopClause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      base,
    ),
    query<{ label: string; n: string }>(
      `SELECT COALESCE(NULLIF(province, ''), 'ไม่ระบุจังหวัด') AS label, count(*)::text AS n
         FROM platform_orders
        WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz
          AND order_status = 'CANCELLED'${shopClause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      base,
    ),
    query<{ name: string; sku: string; quantity: string; revenue: string; image: string | null }>(
      `SELECT COALESCE(NULLIF(i.product_name, ''), NULLIF(i.sku_name, ''), 'ไม่ระบุ') AS name,
              COALESCE(NULLIF(btrim(o.raw_json->'line_items'->0->>'seller_sku'), ''), '') AS sku,
              COALESCE(sum(i.quantity), 0)::text AS quantity,
              COALESCE(sum(i.sale_price * i.quantity), 0)::text AS revenue,
              max(NULLIF(btrim(i.image_url), '')) AS image
         FROM platform_order_items i
         JOIN platform_orders o ON o.shop_id = i.shop_id AND o.order_id = i.order_id
        WHERE o.create_time >= $1::timestamptz AND o.create_time < $2::timestamptz
          AND o.order_status <> 'CANCELLED'${shopClause.replace("shop_id", "o.shop_id")}
        GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 8`,
      base,
    ),
    // ขายได้ช่วงก่อน แต่ช่วงนี้ไม่ขายเลย
    query<{ name: string; quantity: string; image: string | null }>(
      `WITH cur AS (
         SELECT COALESCE(NULLIF(i.sku_name, ''), i.product_name, 'ไม่ระบุ') AS name,
                COALESCE(sum(i.quantity), 0) AS q
           FROM platform_order_items i
           JOIN platform_orders o ON o.shop_id = i.shop_id AND o.order_id = i.order_id
          WHERE o.create_time >= $1::timestamptz AND o.create_time < $2::timestamptz
            AND o.order_status <> 'CANCELLED'${params.shopId ? " AND o.shop_id = $4::text" : ""}
          GROUP BY 1
       ), prev AS (
         SELECT COALESCE(NULLIF(i.sku_name, ''), i.product_name, 'ไม่ระบุ') AS name,
                COALESCE(sum(i.quantity), 0) AS q,
                max(NULLIF(btrim(i.image_url), '')) AS image
           FROM platform_order_items i
           JOIN platform_orders o ON o.shop_id = i.shop_id AND o.order_id = i.order_id
          WHERE o.create_time >= $3::timestamptz AND o.create_time < $1::timestamptz
            AND o.order_status <> 'CANCELLED'${params.shopId ? " AND o.shop_id = $4::text" : ""}
          GROUP BY 1
       )
       SELECT prev.name, prev.q::text AS quantity, prev.image
         FROM prev LEFT JOIN cur USING (name)
        WHERE COALESCE(cur.q, 0) = 0 AND prev.q > 0
        ORDER BY prev.q DESC LIMIT 8`,
      params.shopId
        ? [start.toISOString(), end.toISOString(), prevStart.toISOString(), params.shopId]
        : [start.toISOString(), end.toISOString(), prevStart.toISOString()],
    ),
    // สินค้าที่ถูกยกเลิกบ่อย (ในกลุ่มที่ขายเกิน 10 ชิ้น)
    query<{ name: string; sold: string; cancelled: string; image: string | null }>(
      `SELECT COALESCE(NULLIF(i.product_name, ''), NULLIF(i.sku_name, ''), 'ไม่ระบุ') AS name,
              count(*)::text AS sold,
              count(*) FILTER (WHERE o.order_status = 'CANCELLED')::text AS cancelled,
              max(NULLIF(btrim(i.image_url), '')) AS image
         FROM platform_order_items i
         JOIN platform_orders o ON o.shop_id = i.shop_id AND o.order_id = i.order_id
        WHERE o.create_time >= $1::timestamptz AND o.create_time < $2::timestamptz${shopClause.replace("shop_id", "o.shop_id")}
        GROUP BY 1 HAVING count(*) >= 10
        ORDER BY (count(*) FILTER (WHERE o.order_status = 'CANCELLED')::numeric / count(*)) DESC
        LIMIT 6`,
      base,
    ),
    // ราคาที่ขายได้จริง เทียบราคาตั้ง (จากข้อมูลดิบของ TikTok)
    query<{ n: string; avg_sale: string; avg_list: string }>(
      `WITH li AS (
         SELECT CASE WHEN elem->>'sale_price' ~ '^[0-9.]+$' THEN (elem->>'sale_price')::numeric END AS sale_price,
                CASE WHEN elem->>'original_price' ~ '^[0-9.]+$' THEN (elem->>'original_price')::numeric END AS list_price
           FROM platform_orders o,
                jsonb_array_elements(COALESCE(o.raw_json->'line_items', '[]'::jsonb)) elem
          WHERE o.create_time >= $1::timestamptz AND o.create_time < $2::timestamptz
            AND o.order_status <> 'CANCELLED'${shopClause.replace("shop_id", "o.shop_id")}
       )
       SELECT count(*)::text AS n,
              COALESCE(avg(sale_price), 0)::text AS avg_sale,
              COALESCE(avg(list_price) FILTER (WHERE list_price > 0), 0)::text AS avg_list
         FROM li`,
      base,
    ),
  ]);

  const totalOrders = toNumber(cancelTotals[0]?.total);
  const cancelledOrders = toNumber(cancelTotals[0]?.cancelled);
  const rate = (count: number, base_: number) =>
    base_ > 0 ? Math.round((count / base_) * 1000) / 10 : 0;

  const toRow = (r: {
    order_id: string;
    order_status: string;
    due_at: string;
    late_seconds: string;
    total_amount: string;
    province: string | null;
    tracking_number: string | null;
  }): OpsOrderRow => ({
    orderId: r.order_id,
    status: r.order_status,
    dueAt: r.due_at,
    hoursLate: Math.round(toNumber(r.late_seconds) / 3600),
    amount: toNumber(r.total_amount),
    province: r.province,
    tracking: r.tracking_number,
  });

  return {
    range: { from, to },
    overdue: { count: overdueRows.length, rows: overdueRows.slice(0, 8).map(toRow) },
    noTracking: { count: noTrackingRows.length, rows: noTrackingRows.slice(0, 6).map(toRow) },
    stuck: {
      count: stuckRows.length,
      rows: stuckRows.slice(0, 6).map((r) => ({
        tracking: r.tracking_number,
        carrier: r.shipping_provider,
        status: r.status,
        idleDays: Math.round(toNumber(r.idle_days)),
      })),
    },
    cancels: {
      total: totalOrders,
      cancelled: cancelledOrders,
      rate: rate(cancelledOrders, totalOrders),
      byInitiator: cancelInitiators.map((r) => ({
        label: r.label,
        count: toNumber(r.n),
        rate: rate(toNumber(r.n), cancelledOrders),
      })),
      byReason: cancelReasons.map((r) => ({
        label: r.label,
        count: toNumber(r.n),
        rate: rate(toNumber(r.n), cancelledOrders),
      })),
      byProvince: cancelProvinces.map((r) => ({
        label: r.label,
        count: toNumber(r.n),
        rate: rate(toNumber(r.n), cancelledOrders),
      })),
    },
    products: {
      top: topProducts.map((r) => ({
        name: r.name,
        sku: r.sku,
        quantity: toNumber(r.quantity),
        revenue: toNumber(r.revenue),
        image: r.image ?? null,
      })),
      dropped: droppedProducts.map((r) => ({
        name: r.name,
        sku: "",
        quantity: toNumber(r.quantity),
        revenue: 0,
        image: r.image ?? null,
      })),
      byCancel: cancelProducts.map((r) => ({
        name: r.name,
        sold: toNumber(r.sold),
        cancelled: toNumber(r.cancelled),
        rate: rate(toNumber(r.cancelled), toNumber(r.sold)),
        image: r.image ?? null,
      })),
    },
    price: {
      units: toNumber(priceRows[0]?.n),
      avgSale: Math.round(toNumber(priceRows[0]?.avg_sale)),
      avgList: Math.round(toNumber(priceRows[0]?.avg_list)),
    },
  };
}
