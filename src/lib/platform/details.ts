// รายละเอียดเบื้องหลัง "การ์ดสรุป" ทุกใบของหมวดแพลตฟอร์ม
// ใช้พารามิเตอร์เดียว ?detail=<kind>:<value>[:<label>] → เปิดป๊อปอัปแสดงออเดอร์จริงที่อยู่เบื้องหลังตัวเลขนั้น
// ออกแบบเป็นกลไกเดียวเพื่อไม่ให้แต่ละหน้าเขียนคิวรี/หน้าต่างของตัวเองซ้ำ

import { query } from "@/lib/db";
import { resolveRange, thaiDate } from "@/lib/platform/period";

export type DetailKind =
  | "customer"
  | "product"
  | "reason"
  | "initiator"
  | "province"
  | "district"
  | "status"
  | "kpi"
  | "statement";

export type DetailFilter = {
  from?: string;
  to?: string;
  shopId?: string;
  kind: DetailKind;
  value: string;
};

export type DetailOrderRow = {
  orderId: string;
  createTime: string;
  status: string;
  totalAmount: number;
  settlement: number | null;
  cancelReason: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
};

export type DetailView = {
  title: string;
  description: string;
  total: number;
  amount: number;
  settlement: number | null;
  rows: DetailOrderRow[];
};

const KIND_TITLE: Record<DetailKind, (value: string, label?: string) => string> = {
  customer: (_v, label) => `ลูกค้า ${label ?? ""}`.trim(),
  product: (_v, label) => `สินค้า ${label ?? "ที่เลือก"}`,
  reason: (value) => `ยกเลิกเพราะ “${value}”`,
  initiator: (value) =>
    `ยกเลิกโดย${value === "BUYER" ? "ผู้ซื้อ" : value === "SELLER" ? "ร้าน" : "ระบบ"}`,
  province: (value) => `จังหวัด ${value}`,
  district: (value) => `อำเภอ/เขต ${value}`,
  status: (value) => STATUS_TITLE[value] ?? value,
  kpi: (value) => KPI_TITLE[value] ?? value,
  statement: (value) => `statement ${value}`,
};

const STATUS_TITLE: Record<string, string> = {
  AWAITING_SHIPMENT: "ออเดอร์ที่รอจัดส่ง",
  AWAITING_COLLECTION: "ออเดอร์ที่รอขนรับ",
  IN_TRANSIT: "ออเดอร์ที่อยู่ระหว่างขนส่ง",
  CANCELLED: "ออเดอร์ที่ถูกยกเลิก",
};

const KPI_TITLE: Record<string, string> = {
  settlement: "ออเดอร์ที่มียอดโอนในงวดนี้",
  revenue: "ออเดอร์ที่มียอดขายในงวดนี้",
  orders: "ออเดอร์ทั้งหมดในงวดนี้",
  cancelled: "ออเดอร์ที่ถูกยกเลิกในงวดนี้",
};

const KIND_DESCRIPTION: Record<DetailKind, string> = {
  customer: "ออเดอร์ทั้งหมดของลูกค้าคนนี้ในช่วงที่เลือก",
  product: "ออเดอร์ที่มีสินค้าชิ้นนี้ในช่วงที่เลือก",
  reason: "ออเดอร์ที่ถูกยกเลิกด้วยเหตุผลนี้",
  initiator: "ออเดอร์ที่ถูกยกเลิกโดยฝ่ายนี้",
  province: "ออเดอร์ที่ส่งไปจังหวัดนี้",
  district: "ออเดอร์ที่ส่งไปอำเภอ/เขตนี้",
  status: "ออเดอร์ตามสถานะนี้ในช่วงที่เลือก",
  kpi: "ออเดอร์เบื้องหลังตัวเลขในการ์ด",
  statement: "ออเดอร์ที่อยู่ในใบ statement นี้",
};

/** แปลงค่า ?detail=... เป็นชนิด/ค่า/ป้ายชื่อ — คืน null เมื่อรูปแบบไม่ถูกต้อง */
export function parseDetail(raw?: string | null): { kind: DetailKind; value: string; label?: string } | null {
  if (!raw) return null;
  const parts = raw.split(":");
  const kind = parts[0] as DetailKind;
  const value = parts[1] ? decodeURIComponent(parts[1]) : "";
  const label = parts[2] ? decodeURIComponent(parts.slice(2).join(":")) : undefined;
  if (!(kind in KIND_TITLE) || !value) return null;
  return { kind, value, label };
}

/** สร้างค่า ?detail=... สำหรับวางบนลิงก์ */
export function detailParam(kind: DetailKind, value: string, label?: string): string {
  const base = `${kind}:${encodeURIComponent(value)}`;
  return label ? `${base}:${encodeURIComponent(label)}` : base;
}

/** ลิงก์กลับไปหน้าที่ไม่มีพารามิเตอร์ detail (ใช้เป็นปุ่มปิด) */
/** สร้างลิงก์ของหน้านี้พร้อมเติมพารามิเตอร์ detail (คงช่วงเวลา/ร้านเดิมไว้) */
export function hrefWithDetail(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  detail: string,
): string {
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === "detail") continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) qs.set(key, value);
  }
  qs.set("detail", detail);
  return `${basePath}?${qs.toString()}`;
}

export function hrefWithout(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  drop: string,
): string {
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === drop) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) qs.set(key, value);
  }
  return qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
}

function money(value: number): string {
  return `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

/**
 * ดึงออเดอร์เบื้องหลังการ์ด
 * ตัวกรองทุกแบบรวมอยู่ในฟังก์ชันเดียว เพื่อให้หน้าตาและความหมายของตัวเลขตรงกันทุกหน้า
 */
export async function buildDetail(
  parsed: { kind: DetailKind; value: string; label?: string },
  range: { from?: string; to?: string; shopId?: string; platform?: string },
  limit = 40,
): Promise<DetailView> {
  const platform = range.platform ?? "TikTok";
  const { startIso, endIso, fromDay, toDay } = resolveRange(range.from, range.to);
  const params: unknown[] = [platform, startIso, endIso];
  const where: string[] = [];

  const push = (value: string) => {
    params.push(value);
    return `$${params.length}`;
  };

  switch (parsed.kind) {
    case "customer":
      where.push(`o.buyer_user_id = ${push(parsed.value)}`);
      break;
    case "reason":
      where.push(`o.cancel_reason = ${push(parsed.value)}`);
      break;
    case "initiator":
      where.push(`o.cancel_user = ${push(parsed.value)}`);
      break;
    case "province":
      where.push(`o.province = ${push(parsed.value)}`);
      break;
    case "district":
      where.push(`o.district = ${push(parsed.value)}`);
      break;
    case "status":
      where.push(`o.order_status = ${push(parsed.value)}`);
      break;
    case "kpi":
      if (parsed.value === "cancelled") where.push(`o.order_status = 'CANCELLED'`);
      if (parsed.value === "settlement") where.push(`f.settlement_amount IS NOT NULL`);
      if (parsed.value === "revenue") where.push(`f.revenue_amount IS NOT NULL`);
      break;
    case "product": {
      const holder = push(parsed.value);
      // platform_order_items ไม่มีคอลัมน์ sku — จับคู่ด้วยชื่อ SKU หรือชื่อสินค้า
      where.push(
        `EXISTS (SELECT 1 FROM platform_order_items i
                  WHERE i.platform = o.platform AND i.shop_id = o.shop_id AND i.order_id = o.order_id
                    AND (COALESCE(NULLIF(i.sku_name, ''), i.product_name) = ${holder}
                         OR i.product_name = ${holder}))`,
      );
      break;
    }
    case "statement":
      where.push(`f.statement_id = ${push(parsed.value)}`);
      break;
  }

  if (range.shopId) where.push(`o.shop_id = ${push(range.shopId)}`);

  const filterSql = where.length > 0 ? ` AND ${where.join(" AND ")}` : "";

  const totals = await query<{ total: string; amount: string; settlement: string | null }>(
    `SELECT count(*)::text AS total,
            COALESCE(sum(o.total_amount), 0)::text AS amount,
            sum(f.settlement_amount)::text AS settlement
       FROM platform_orders o
       LEFT JOIN platform_order_finance f
         ON f.platform = o.platform AND f.shop_id = o.shop_id AND f.order_id = o.order_id
      WHERE o.platform = $1 AND o.create_time >= $2::timestamptz AND o.create_time < $3::timestamptz${filterSql}`,
    params,
  );

  const rows = await query<{
    order_id: string;
    shop_id: string;
    create_time: string;
    order_status: string;
    total_amount: string;
    settlement_amount: string | null;
    cancel_reason: string | null;
  }>(
    `SELECT o.order_id, o.shop_id, o.create_time::text AS create_time, o.order_status,
            o.total_amount::text AS total_amount, f.settlement_amount::text AS settlement_amount,
            o.cancel_reason
       FROM platform_orders o
       LEFT JOIN platform_order_finance f
         ON f.platform = o.platform AND f.shop_id = o.shop_id AND f.order_id = o.order_id
      WHERE o.platform = $1 AND o.create_time >= $2::timestamptz AND o.create_time < $3::timestamptz${filterSql}
      ORDER BY o.create_time DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}`,
    params,
  );

  // ดึงรายการสินค้าของทุกออเดอร์ที่แสดงในครั้งเดียว (ไม่ยิงคิวรีต่อแถว)
  let itemsByOrder = new Map<string, Array<{ name: string; quantity: number; price: number }>>();
  if (rows.length > 0) {
    const ids = rows.map((row) => row.order_id);
    const items = await query<{
      order_id: string;
      name: string;
      quantity: string;
      price: string;
    }>(
      `SELECT order_id,
              COALESCE(NULLIF(sku_name, ''), product_name, 'ไม่ระบุ') AS name,
              quantity::text AS quantity,
              sale_price::text AS price
         FROM platform_order_items
        WHERE platform = $1 AND order_id = ANY($2::text[])
        ORDER BY order_id, quantity DESC`,
      [platform, ids],
    );
    itemsByOrder = items.reduce((map, item) => {
      const list = map.get(item.order_id) ?? [];
      list.push({
        name: item.name,
        quantity: Number(item.quantity ?? 0),
        price: Number(item.price ?? 0),
      });
      return map.set(item.order_id, list);
    }, new Map<string, Array<{ name: string; quantity: number; price: number }>>());
  }

  const title = KIND_TITLE[parsed.kind](parsed.value, parsed.label);

  return {
    title,
    description: `${KIND_DESCRIPTION[parsed.kind]} · ${thaiDate(fromDay)} ถึง ${thaiDate(toDay)}`,
    total: Number(totals[0]?.total ?? 0),
    amount: Number(totals[0]?.amount ?? 0),
    settlement: totals[0]?.settlement === null ? null : Number(totals[0]?.settlement ?? 0),
    rows: rows.map((row) => ({
      orderId: row.order_id,
      createTime: row.create_time,
      status: row.order_status,
      totalAmount: Number(row.total_amount ?? 0),
      settlement: row.settlement_amount === null ? null : Number(row.settlement_amount),
      cancelReason: row.cancel_reason,
      items: itemsByOrder.get(row.order_id) ?? [],
    })),
  };
}

export { money as detailMoney };
