// สรุปกลุ่มลูกค้าจากออเดอร์ TikTok ที่เก็บไว้แล้ว
//
// ข้อจำกัดที่หน้าจอต้องบอกผู้ใช้: TikTok ปิดชื่อ/เบอร์/บ้านเลขที่ให้ออเดอร์ที่ส่งผ่าน
// ขนส่งของ TikTok (ร้านนี้เป็นแบบนั้นทั้งหมด) จึงเหลือจังหวัด/อำเภอที่ใช้ได้จริง
// และไม่มีข้อมูลอายุหรือเพศจากแพลตฟอร์มเลย

import { query } from "@/lib/db";
import { normalizeDistrictSql, normalizeProvinceSql } from "@/lib/platform/geo";
import { resolveRange } from "@/lib/platform/period";

export interface CustomerProduct {
  name: string;
  quantity: number;
  amount: number;
}

export interface TopCustomer {
  userId: string;
  name: string;
  province: string | null;
  district: string | null;
  orders: number;
  spend: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  products: CustomerProduct[];
}

export interface AreaRow {
  province: string;
  district: string | null;
  customers: number;
  orders: number;
  spend: number;
}

export interface CustomerInsights {
  from: string;
  to: string;
  periodLabel: string;
  totals: {
    customers: number;
    repeatCustomers: number;
    orders: number;
    spend: number;
    avgPerCustomer: number;
    /** ออเดอร์ที่ไม่มี user_id จึงแยกว่าเป็นลูกค้าคนเดิมไม่ได้ */
    anonymousOrders: number;
    /** ออเดอร์ที่ไม่มีข้อมูลจังหวัด (ปกติคือออเดอร์ที่ยังไม่จ่ายเงิน) */
    unlocatedOrders: number;
  };
  topCustomers: TopCustomer[];
  topProvinces: AreaRow[];
  topDistricts: AreaRow[];
  hasData: boolean;
}

export interface CustomerOptions {
  platform?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  rangeDays?: number;
  shopId?: string;
  limit?: number;
}

// ออเดอร์ที่ยังไม่ถึงมือลูกค้าหรือถูกยกเลิก ไม่ใช่ "การซื้อ"
const PURCHASED = "o.order_status NOT IN ('CANCELLED', 'UNPAID', 'ON_HOLD')";

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scope(fromIso: string, toIso: string, shopId?: string, platform = "TikTok") {
  const params: unknown[] = [platform, fromIso, toIso];
  let clause = `o.platform = $1::text AND o.create_time >= $2::timestamptz AND o.create_time < $3::timestamptz AND ${PURCHASED}`;
  if (shopId) {
    params.push(shopId);
    clause += ` AND o.shop_id = $${params.length}::text`;
  }
  return { clause, params };
}

export async function getCustomerInsights(options: CustomerOptions = {}): Promise<CustomerInsights> {
  const range = resolveRange(options.from, options.to, options.rangeDays ?? 30);
  const limit = options.limit ?? 10;
  const fromIso = range.startIso;
  const toIso = range.endIso;
  const { clause, params } = scope(fromIso, toIso, options.shopId, options.platform ?? "TikTok");

  const totalsRows = await query<{
    orders: string;
    spend: string;
    customers: string;
    anonymous: string;
    unlocated: string;
  }>(
    `SELECT count(*)::text AS orders,
            COALESCE(sum(o.total_amount),0)::text AS spend,
            count(DISTINCT o.buyer_user_id)::text AS customers,
            count(*) FILTER (WHERE o.buyer_user_id IS NULL)::text AS anonymous,
            count(*) FILTER (WHERE o.province IS NULL OR o.province = '')::text AS unlocated
     FROM platform_orders o
     WHERE ${clause}`,
    params,
  );
  const totalsRow = totalsRows[0];

  // ลูกค้าซื้อซ้ำ = user_id เดียวกันมีมากกว่าหนึ่งออเดอร์ในช่วงนี้
  const repeatRows = await query<{ repeat: string }>(
    `SELECT count(*)::text AS repeat FROM (
       SELECT o.buyer_user_id
       FROM platform_orders o
       WHERE ${clause} AND o.buyer_user_id IS NOT NULL
       GROUP BY o.buyer_user_id
       HAVING count(*) > 1
     ) AS repeated`,
    params,
  );

  const customerRows = await query<{
    userId: string;
    name: string | null;
    province: string | null;
    district: string | null;
    orders: string;
    spend: string;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  }>(
    `SELECT o.buyer_user_id AS "userId",
            max(o.recipient_name) AS name,
            max(o.province) AS province,
            max(o.district) AS district,
            count(*)::text AS orders,
            COALESCE(sum(o.total_amount),0)::text AS spend,
            min(o.create_time)::text AS "firstOrderAt",
            max(o.create_time)::text AS "lastOrderAt"
     FROM platform_orders o
     WHERE ${clause} AND o.buyer_user_id IS NOT NULL
     GROUP BY o.buyer_user_id
     ORDER BY COALESCE(sum(o.total_amount),0) DESC
     LIMIT ${limit}`,
    params,
  );

  const topCustomerIds = customerRows.map((row) => row.userId);
  const productsByCustomer = new Map<string, CustomerProduct[]>();
  if (topCustomerIds.length > 0) {
    const productRows = await query<{
      userId: string;
      name: string | null;
      quantity: string;
      amount: string;
    }>(
      `SELECT o.buyer_user_id AS "userId",
              i.product_name AS name,
              COALESCE(sum(i.quantity),0)::text AS quantity,
              COALESCE(sum(i.sale_price * i.quantity),0)::text AS amount
       FROM platform_order_items i
       JOIN platform_orders o
         ON o.platform = i.platform AND o.shop_id = i.shop_id AND o.order_id = i.order_id
       WHERE ${clause} AND o.buyer_user_id = ANY($${params.length + 1}::text[])
       GROUP BY o.buyer_user_id, i.product_name
       ORDER BY o.buyer_user_id, COALESCE(sum(i.sale_price * i.quantity),0) DESC`,
      [...params, topCustomerIds],
    );
    for (const row of productRows) {
      const list = productsByCustomer.get(row.userId) ?? [];
      if (list.length >= 3) continue;
      list.push({
        name: row.name ?? "ไม่ระบุชื่อสินค้า",
        quantity: num(row.quantity),
        amount: num(row.amount),
      });
      productsByCustomer.set(row.userId, list);
    }
  }

  // รวมชื่อจังหวัดที่เขียนต่างกันให้เป็นชื่อเดียว (ดู geo.ts) ก่อนจัดอันดับ
  const provinceExpr = normalizeProvinceSql("o.province");
  const provinceRows = await query<{ province: string; customers: string; orders: string; spend: string }>(
    `SELECT ${provinceExpr} AS province,
            count(DISTINCT o.buyer_user_id)::text AS customers,
            count(*)::text AS orders,
            COALESCE(sum(o.total_amount),0)::text AS spend
     FROM platform_orders o
     WHERE ${clause} AND o.province IS NOT NULL AND o.province <> ''
     GROUP BY 1
     ORDER BY COALESCE(sum(o.total_amount),0) DESC
     LIMIT ${limit}`,
    params,
  );

  const districtRows = await query<{
    province: string;
    district: string;
    customers: string;
    orders: string;
    spend: string;
  }>(
    `SELECT ${provinceExpr} AS province,
            ${normalizeDistrictSql("o.district")} AS district,
            count(DISTINCT o.buyer_user_id)::text AS customers,
            count(*)::text AS orders,
            COALESCE(sum(o.total_amount),0)::text AS spend
     FROM platform_orders o
     WHERE ${clause} AND o.district IS NOT NULL AND o.district <> ''
     GROUP BY 1, 2
     ORDER BY COALESCE(sum(o.total_amount),0) DESC
     LIMIT ${limit}`,
    params,
  );

  const customers = num(totalsRow?.customers);
  const spend = num(totalsRow?.spend);
  const orders = num(totalsRow?.orders);

  return {
    from: fromIso,
    to: toIso,
    periodLabel: `${range.fromDay} → ${range.toDay}`,
    totals: {
      customers,
      repeatCustomers: num(repeatRows[0]?.repeat),
      orders,
      spend,
      avgPerCustomer: customers > 0 ? spend / customers : 0,
      anonymousOrders: num(totalsRow?.anonymous),
      unlocatedOrders: num(totalsRow?.unlocated),
    },
    topCustomers: customerRows.map((row) => ({
      userId: row.userId,
      name: row.name ?? "ไม่ทราบชื่อ",
      province: row.province,
      district: row.district,
      orders: num(row.orders),
      spend: num(row.spend),
      firstOrderAt: row.firstOrderAt,
      lastOrderAt: row.lastOrderAt,
      products: productsByCustomer.get(row.userId) ?? [],
    })),
    topProvinces: provinceRows.map((row) => ({
      province: row.province,
      district: null,
      customers: num(row.customers),
      orders: num(row.orders),
      spend: num(row.spend),
    })),
    topDistricts: districtRows.map((row) => ({
      province: row.province,
      district: row.district,
      customers: num(row.customers),
      orders: num(row.orders),
      spend: num(row.spend),
    })),
    hasData: orders > 0,
  };
}
