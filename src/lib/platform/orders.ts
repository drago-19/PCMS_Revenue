// รายการ/รายละเอียดออเดอร์จากฐานข้อมูลเรา (ตาราง platform_orders + items + finance)

import { query, queryOne } from "@/lib/db";

export interface OrderRow {
  orderId: string;
  status: string;
  createTime: string | null;
  totalAmount: number;
  currency: string | null;
  itemCount: number;
  settlement: number;
  cancelReason: string | null;
  firstName: string | null;
  firstImage: string | null;
}

export interface OrderDetail {
  orderId: string;
  status: string;
  createTime: string | null;
  paidTime: string | null;
  shippedTime: string | null;
  deliveredTime: string | null;
  cancelledTime: string | null;
  cancelReason: string | null;
  cancelUser: string | null;
  trackingNumber: string | null;
  shippingProvider: string | null;
  totalAmount: number;
  currency: string | null;
  items: Array<{ name: string; sku: string | null; imageUrl: string | null; quantity: number; price: number }>;
  money: { revenue: number; fee: number; settlement: number; statementId: string | null };
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface OrderFilter {
  shopId?: string;
  status?: string;
  search?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  page?: number;
  pageSize?: number;
}

export async function listPlatformOrders(filter: OrderFilter): Promise<{ rows: OrderRow[]; total: number }> {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];

  if (filter.shopId) {
    params.push(filter.shopId);
    where.push(`o.shop_id = $${params.length}::text`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`o.order_status = $${params.length}::text`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(o.order_id ILIKE $${params.length} OR EXISTS (
      SELECT 1 FROM platform_order_items i2
      WHERE i2.shop_id = o.shop_id AND i2.order_id = o.order_id
        AND (i2.product_name ILIKE $${params.length} OR i2.sku_id ILIKE $${params.length})
    ))`);
  }
  if (filter.from) {
    params.push(`${filter.from}T00:00:00Z`);
    where.push(`o.create_time >= $${params.length}::timestamptz`);
  }
  if (filter.to) {
    params.push(`${filter.to}T23:59:59Z`);
    where.push(`o.create_time <= $${params.length}::timestamptz`);
  }

  const pageSize = Math.min(Math.max(filter.pageSize ?? 25, 1), 100);
  const page = Math.max(filter.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const totalRows = await query<{ total: string }>(
    `SELECT count(*)::text AS total FROM platform_orders o WHERE ${where.join(" AND ")}`,
    params,
  );

  const rows = await query<{
    order_id: string;
    order_status: string;
    create_time: string | null;
    total_amount: string | null;
    currency: string | null;
    item_count: string;
    settlement: string | null;
    cancel_reason: string | null;
  }>(
    `SELECT o.order_id,
            o.order_status,
            o.create_time::text AS create_time,
            o.total_amount::text AS total_amount,
            o.currency,
            (SELECT count(*) FROM platform_order_items i
              WHERE i.shop_id = o.shop_id AND i.order_id = o.order_id)::text AS item_count,
            f.settlement_amount::text AS settlement,
            o.cancel_reason
     FROM platform_orders o
     LEFT JOIN platform_order_finance f
       ON f.shop_id = o.shop_id AND f.order_id = o.order_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.create_time DESC NULLS LAST
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  // ดึงชื่อ/รูปของรายการแรกเฉพาะออเดอร์ในหน้านี้ (ไม่ทำแบบต่อออเดอร์ทั้งตาราง)
  const orderIds = rows.map((row) => row.order_id);
  const firstItems = new Map<string, { name: string | null; image: string | null }>();

  if (orderIds.length > 0) {
    const itemRows = await query<{
      order_id: string;
      product_name: string | null;
      sku_name: string | null;
      image_url: string | null;
    }>(
      `SELECT DISTINCT ON (order_id) order_id, product_name, sku_name, image_url
       FROM platform_order_items
       WHERE order_id = ANY($1::text[])
       ORDER BY order_id, line_item_id`,
      [orderIds],
    );

    for (const item of itemRows) {
      firstItems.set(item.order_id, {
        name: item.product_name ?? item.sku_name,
        image: item.image_url,
      });
    }
  }

  return {
    total: num(totalRows[0]?.total),
    rows: rows.map((row) => ({
      orderId: row.order_id,
      status: row.order_status,
      createTime: row.create_time,
      totalAmount: num(row.total_amount),
      currency: row.currency,
      itemCount: num(row.item_count),
      settlement: num(row.settlement),
      cancelReason: row.cancel_reason,
      firstName: firstItems.get(row.order_id)?.name ?? null,
      firstImage: firstItems.get(row.order_id)?.image ?? null,
    })),
  };
}

export interface OrderSummary {
  orders: number;
  settlement: number;
  cancelled: number;
  items: number;
}

/** สรุปตามเงื่อนไขกรองเดียวกับรายการ — ใช้แสดงแถบสรุปเหนือตาราง */
export async function getOrderSummary(filter: OrderFilter): Promise<OrderSummary> {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];

  if (filter.shopId) {
    params.push(filter.shopId);
    where.push(`o.shop_id = $${params.length}::text`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`o.order_status = $${params.length}::text`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(o.order_id ILIKE $${params.length} OR EXISTS (
      SELECT 1 FROM platform_order_items i2
      WHERE i2.shop_id = o.shop_id AND i2.order_id = o.order_id
        AND (i2.product_name ILIKE $${params.length} OR i2.sku_id ILIKE $${params.length})
    ))`);
  }
  if (filter.from) {
    params.push(`${filter.from}T00:00:00Z`);
    where.push(`o.create_time >= $${params.length}::timestamptz`);
  }
  if (filter.to) {
    params.push(`${filter.to}T23:59:59Z`);
    where.push(`o.create_time <= $${params.length}::timestamptz`);
  }

  // แยกเป็น 2 คำสั่งง่าย ๆ — เดิมนับรายการสินค้าแบบถามซ้ำทีละออเดอร์จนใช้เวลา ~57 วินาที
  const totals = await query<{ orders: string; settlement: string; cancelled: string }>(
    `SELECT count(DISTINCT o.order_id)::text AS orders,
            COALESCE(sum(f.settlement_amount),0)::text AS settlement,
            count(DISTINCT o.order_id) FILTER (WHERE o.order_status = 'CANCELLED')::text AS cancelled
     FROM platform_orders o
     LEFT JOIN platform_order_finance f
       ON f.shop_id = o.shop_id AND f.order_id = o.order_id
     WHERE ${where.join(" AND ")}`,
    params,
  );

  const itemRow = await query<{ items: string }>(
    `SELECT count(*)::text AS items
     FROM platform_order_items i
     JOIN platform_orders o ON o.shop_id = i.shop_id AND o.order_id = i.order_id
     WHERE ${where.join(" AND ")}`,
    params,
  );

  return {
    orders: num(totals[0]?.orders),
    settlement: num(totals[0]?.settlement),
    cancelled: num(totals[0]?.cancelled),
    items: num(itemRow[0]?.items),
  };
}

export async function getPlatformOrder(orderId: string, shopId?: string): Promise<OrderDetail | null> {
  const params: unknown[] = [orderId];
  const shopClause = shopId ? " AND shop_id = $2::text" : "";
  if (shopId) params.push(shopId);

  const order = await queryOne<{
    order_id: string;
    order_status: string;
    create_time: string | null;
    paid_time: string | null;
    shipped_time: string | null;
    delivered_time: string | null;
    cancelled_time: string | null;
    cancel_reason: string | null;
    cancel_user: string | null;
    tracking_number: string | null;
    shipping_provider: string | null;
    total_amount: string | null;
    currency: string | null;
    shop_id: string;
  }>(
    `SELECT order_id, order_status, create_time::text AS create_time, paid_time::text AS paid_time,
            shipped_time::text AS shipped_time, delivered_time::text AS delivered_time,
            cancelled_time::text AS cancelled_time, cancel_reason, cancel_user,
            tracking_number, shipping_provider, total_amount::text AS total_amount, currency, shop_id
     FROM platform_orders WHERE order_id = $1${shopClause} LIMIT 1`,
    params,
  );

  if (!order) return null;

  const items = await query<{
    product_name: string | null;
    sku_id: string | null;
    sku_name: string | null;
    image_url: string | null;
    quantity: number;
    sale_price: string | null;
  }>(
    `SELECT product_name, sku_id, sku_name, image_url, quantity, sale_price::text AS sale_price
     FROM platform_order_items WHERE shop_id = $1 AND order_id = $2 ORDER BY line_item_id`,
    [order.shop_id, orderId],
  );

  const finance = await queryOne<{
    revenue_amount: string | null;
    fee_and_tax_amount: string | null;
    settlement_amount: string | null;
    statement_id: string | null;
  }>(
    `SELECT revenue_amount::text, fee_and_tax_amount::text, settlement_amount::text, statement_id
     FROM platform_order_finance WHERE shop_id = $1 AND order_id = $2 LIMIT 1`,
    [order.shop_id, orderId],
  );

  return {
    orderId: order.order_id,
    status: order.order_status,
    createTime: order.create_time,
    paidTime: order.paid_time,
    shippedTime: order.shipped_time,
    deliveredTime: order.delivered_time,
    cancelledTime: order.cancelled_time,
    cancelReason: order.cancel_reason,
    cancelUser: order.cancel_user,
    trackingNumber: order.tracking_number,
    shippingProvider: order.shipping_provider,
    totalAmount: num(order.total_amount),
    currency: order.currency,
    items: items.map((item) => ({
      name: item.product_name ?? item.sku_name ?? "ไม่ระบุ",
      sku: item.sku_id,
      imageUrl: item.image_url,
      quantity: num(item.quantity),
      price: num(item.sale_price),
    })),
    money: {
      revenue: num(finance?.revenue_amount),
      fee: num(finance?.fee_and_tax_amount),
      settlement: num(finance?.settlement_amount),
      statementId: finance?.statement_id ?? null,
    },
  };
}
