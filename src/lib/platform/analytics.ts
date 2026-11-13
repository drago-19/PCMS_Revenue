// คำนวณตัวเลขสำหรับแดชบอร์ดผู้บริหาร จากตาราง platform_* ที่เก็บไว้แล้ว
//
// ออกแบบตามคำถามทางธุรกิจ ไม่ใช่ตามที่มีข้อมูล:
//   ช่วงนี้เป็นอย่างไร → เทียบช่วงก่อน → แนวโน้ม → ต้นเหตุ → อะไรผิดปกติ → ควรทำอะไร

import { query } from "@/lib/db";
import { isoDay, resolveRange } from "@/lib/platform/period";

export interface PeriodTotals {
  settlement: number;
  revenue: number;
  fee: number;
  orders: number;
  cancelled: number;
  delivered: number;
}

export interface DayPoint {
  date: string;
  settlement: number;
  orders: number;
}

export interface TopProduct {
  name: string;
  revenue: number;
  quantity: number;
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface AlertItem {
  level: "red" | "amber" | "green";
  title: string;
  detail: string;
}

export interface TikTokAnalytics {
  rangeDays: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  daily: DayPoint[];
  topProducts: TopProduct[];
  cancelReasons: ReasonCount[];
  statusCounts: ReasonCount[];
  alerts: AlertItem[];
  insights: string[];
  hasData: boolean;
  lastSyncedAt: string | null;
}

const EMPTY: PeriodTotals = {
  settlement: 0,
  revenue: 0,
  fee: 0,
  orders: 0,
  cancelled: 0,
  delivered: 0,
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(change: number, base: number): number | null {
  if (!base) return null;
  return Math.round((change / base) * 1000) / 10;
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

async function periodTotals(fromIso: string, toIso: string, shopId?: string): Promise<PeriodTotals> {
  const shopClause = shopId ? " AND shop_id = $3::text" : "";
  const params = shopId ? [fromIso, toIso, shopId] : [fromIso, toIso];
  const finance = await query<{ settlement: string; revenue: string; fee: string }>(
    `SELECT COALESCE(sum(settlement_amount),0)::text AS settlement,
            COALESCE(sum(revenue_amount),0)::text AS revenue,
            COALESCE(sum(fee_and_tax_amount),0)::text AS fee
     FROM platform_order_finance
     WHERE order_create_time >= $1::timestamptz AND order_create_time < $2::timestamptz${shopClause}`,
    params,
  );

  const orders = await query<{ total: string; cancelled: string; delivered: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE order_status = 'CANCELLED')::text AS cancelled,
            count(*) FILTER (WHERE order_status = 'DELIVERED' OR order_status = 'COMPLETED')::text AS delivered
     FROM platform_orders
     WHERE create_time >= $1::timestamptz AND create_time < $2::timestamptz${shopClause}`,
    params,
  );

  return {
    settlement: toNumber(finance[0]?.settlement),
    revenue: toNumber(finance[0]?.revenue),
    fee: toNumber(finance[0]?.fee),
    orders: toNumber(orders[0]?.total),
    cancelled: toNumber(orders[0]?.cancelled),
    delivered: toNumber(orders[0]?.delivered),
  };
}

export interface ShopTotal {
  shopId: string;
  settlement: number;
  orders: number;
  cancelled: number;
}

export interface AnalyticsOptions {
  rangeDays?: number;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  shopId?: string;
}

export async function getTikTokAnalytics(
  options: AnalyticsOptions = {},
): Promise<TikTokAnalytics & { perShop: ShopTotal[]; periodLabel: string; compareLabel: string }> {
  const shopId = options.shopId;
  const range = resolveRange(options.from, options.to, options.rangeDays ?? 30);
  const toDate = new Date(range.endIso);
  const fromDate = new Date(range.startIso);
  const spanMs = Math.max(toDate.getTime() - fromDate.getTime(), 86400_000);
  const rangeDays = Math.max(1, Math.round(spanMs / 86400_000));
  const toIso = range.endIso;
  const from = fromDate;
  const prevFrom = new Date(from.getTime() - spanMs);
  const periodLabel = `${range.fromDay} → ${range.toDay}`;
  const compareLabel = `${isoDay(prevFrom)} → ${range.fromDay}`;

  const [current, previous] = await Promise.all([
    periodTotals(from.toISOString(), toIso, shopId),
    periodTotals(prevFrom.toISOString(), from.toISOString(), shopId),
  ]);

  // ยอดรวมแยกร้าน (ใช้เมื่อดูแบบ "ทุกร้าน")
  const perShopRows = await query<{
    shop_id: string;
    settlement: string;
    orders: string;
    cancelled: string;
  }>(
    `SELECT o.shop_id,
            COALESCE(sum(f.settlement_amount),0)::text AS settlement,
            count(DISTINCT o.order_id)::text AS orders,
            count(DISTINCT o.order_id) FILTER (WHERE o.order_status = 'CANCELLED')::text AS cancelled
     FROM platform_orders o
     LEFT JOIN platform_order_finance f
       ON f.shop_id = o.shop_id AND f.order_id = o.order_id
     WHERE o.create_time >= $1::timestamptz
     GROUP BY 1 ORDER BY sum(f.settlement_amount) DESC NULLS LAST`,
    [from.toISOString()],
  );

  const perShop: ShopTotal[] = perShopRows.map((row) => ({
    shopId: row.shop_id,
    settlement: toNumber(row.settlement),
    orders: toNumber(row.orders),
    cancelled: toNumber(row.cancelled),
  }));

  const dailyRows = await query<{ day: string; settlement: string; orders: string }>(
    `SELECT to_char(date_trunc('day', f.order_create_time), 'YYYY-MM-DD') AS day,
            COALESCE(sum(f.settlement_amount),0)::text AS settlement,
            COALESCE(count(DISTINCT f.order_id),0)::text AS orders
     FROM platform_order_finance f
     WHERE f.order_create_time >= $1::timestamptz${shopId ? " AND f.shop_id = $2::text" : ""}
     GROUP BY 1 ORDER BY 1`,
    shopId ? [from.toISOString(), shopId] : [from.toISOString()],
  );

  const productRows = await query<{ name: string; revenue: string; quantity: string }>(
    `SELECT COALESCE(NULLIF(i.product_name, ''), NULLIF(i.sku_name, ''), i.sku_id, 'ไม่ระบุ') AS name,
            COALESCE(sum(i.sale_price * i.quantity),0)::text AS revenue,
            COALESCE(sum(i.quantity),0)::text AS quantity
     FROM platform_order_items i
     JOIN platform_orders o ON o.order_id = i.order_id
     WHERE o.create_time >= $1::timestamptz AND o.order_status <> 'CANCELLED'${shopId ? " AND o.shop_id = $2::text" : ""}
     GROUP BY 1 ORDER BY sum(i.sale_price * i.quantity) DESC NULLS LAST LIMIT 8`,
    shopId ? [from.toISOString(), shopId] : [from.toISOString()],
  );

  const cancelRows = await query<{ reason: string; count: string }>(
    `SELECT COALESCE(NULLIF(cancel_reason, ''), 'ไม่ระบุเหตุผล') AS reason, count(*)::text AS count
     FROM platform_orders
     WHERE create_time >= $1::timestamptz AND order_status = 'CANCELLED'${shopId ? " AND shop_id = $2::text" : ""}
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 6`,
    shopId ? [from.toISOString(), shopId] : [from.toISOString()],
  );

  const statusRows = await query<{ status: string; count: string }>(
    `SELECT order_status AS status, count(*)::text AS count
     FROM platform_orders WHERE create_time >= $1::timestamptz${shopId ? " AND shop_id = $2::text" : ""}
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 8`,
    shopId ? [from.toISOString(), shopId] : [from.toISOString()],
  );

  const lastRun = await query<{ finished_at: string | null }>(
    `SELECT finished_at::text AS finished_at FROM platform_sync_runs
     WHERE status = 'done' ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
  );

  const daily: DayPoint[] = dailyRows.map((row) => ({
    date: row.day,
    settlement: toNumber(row.settlement),
    orders: toNumber(row.orders),
  }));

  const topProducts: TopProduct[] = productRows.map((row) => ({
    name: row.name,
    revenue: toNumber(row.revenue),
    quantity: toNumber(row.quantity),
  }));

  const cancelReasons: ReasonCount[] = cancelRows.map((row) => ({
    reason: row.reason,
    count: toNumber(row.count),
  }));

  const statusCounts: ReasonCount[] = statusRows.map((row) => ({
    reason: row.status,
    count: toNumber(row.count),
  }));

  const hasData = current.orders > 0 || daily.length > 0;
  const alerts: AlertItem[] = [];
  const insights: string[] = [];

  const settlementChange = pct(current.settlement - previous.settlement, previous.settlement);
  const orderChange = pct(current.orders - previous.orders, previous.orders);
  const cancelRate = current.orders > 0 ? (current.cancelled / current.orders) * 100 : 0;
  const prevCancelRate = previous.orders > 0 ? (previous.cancelled / previous.orders) * 100 : 0;

  if (settlementChange !== null && settlementChange <= -10) {
    alerts.push({
      level: "red",
      title: `ยอดโอนลด ${Math.abs(settlementChange).toFixed(1)}% จากช่วงก่อน`,
      detail: `ช่วง ${rangeDays} วันนี้ ฿${money(current.settlement)} เทียบกับ ฿${money(previous.settlement)} ของช่วงก่อน`,
    });
  }
  if (cancelRate >= 5) {
    const top = cancelReasons.slice(0, 2);
    const reasonText =
      top.length > 0
        ? `สาเหตุหลัก: ${top
            .map((entry) => `${entry.reason} (${entry.count.toLocaleString("th-TH")})`)
            .join(" · ")}`
        : "ยังไม่มีเหตุผลที่ระบุไว้ในออเดอร์";
    alerts.push({
      level: "red",
      title: `อัตรายกเลิก ${cancelRate.toFixed(1)}% สูงกว่าเกณฑ์ 5%`,
      detail: `ยกเลิก ${current.cancelled.toLocaleString("th-TH")} จาก ${current.orders.toLocaleString("th-TH")} ออเดอร์ — ${reasonText}`,
    });
  } else if (cancelRate > prevCancelRate + 1) {
    alerts.push({
      level: "amber",
      title: `อัตรายกเลิกเพิ่มขึ้นเป็น ${cancelRate.toFixed(1)}%`,
      detail: `ช่วงก่อนอยู่ที่ ${prevCancelRate.toFixed(1)}%`,
    });
  }
  const lastDay = daily.at(-1);
  if (lastDay && lastDay.orders === 0) {
    alerts.push({
      level: "amber",
      title: "ไม่มีออเดอร์ของเมื่อวาน",
      detail: "อาจเป็นวันหยุดร้าน หรือข้อมูลยังดึงมาไม่ถึง — ตรวจประวัติการดึง",
    });
  }
  if (alerts.length === 0 && hasData) {
    alerts.push({
      level: "green",
      title: "ไม่มีสัญญาณผิดปกติในช่วงนี้",
      detail: `อัตรายกเลิก ${cancelRate.toFixed(1)}% · ยอดโอน ${settlementChange === null ? "ยังไม่มีฐานเทียบ" : `${settlementChange >= 0 ? "+" : ""}${settlementChange.toFixed(1)}% เทียบช่วงก่อน`}`,
    });
  }

  if (hasData) {
    if (settlementChange !== null) {
      insights.push(
        `ยอดโอน${settlementChange >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(settlementChange).toFixed(1)}% เทียบช่วง ${rangeDays} วันก่อน` +
          (orderChange !== null ? ` ขณะที่จำนวนออเดอร์${orderChange >= 0 ? "เพิ่ม" : "ลด"} ${Math.abs(orderChange).toFixed(1)}%` : ""),
      );
    }
    if (topProducts.length > 0) {
      const top = topProducts[0];
      const share = current.revenue > 0 ? (top.revenue / current.revenue) * 100 : 0;
      insights.push(`สินค้าที่ทำยอดสูงสุดคือ “${top.name}” (${money(top.revenue)} บาท ≈ ${share.toFixed(1)}% ของยอดขายรวม)`);
    }
    if (cancelReasons.length > 0) {
      insights.push(`เหตุผลยกเลิกอันดับหนึ่ง: “${cancelReasons[0].reason}” (${cancelReasons[0].count} ออเดอร์) — ควรตรวจ stock/ขนส่งจุดนี้ก่อน`);
    }
    if (current.delivered > 0) {
      insights.push(
        `ส่งถึงแล้ว ${current.delivered} ออเดอร์ คิดเป็น ${((current.delivered / Math.max(current.orders, 1)) * 100).toFixed(0)}% ของออเดอร์ในช่วงนี้`,
      );
    }
  }

  return {
    rangeDays,
    current,
    previous,
    daily,
    topProducts,
    cancelReasons,
    statusCounts,
    alerts,
    insights,
    hasData,
    lastSyncedAt: lastRun[0]?.finished_at ?? null,
    perShop: shopId ? [] : perShop,
    periodLabel,
    compareLabel,
  };
}
