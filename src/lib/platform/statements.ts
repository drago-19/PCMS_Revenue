// รายการ statement (ใบสรุปยอดโอนรายวัน) ของ TikTok ที่เก็บไว้แล้ว
import { query } from "@/lib/db";
import { resolveRange } from "@/lib/platform/period";

export interface StatementRow {
  statementId: string;
  time: string | null;
  revenue: number;
  fee: number;
  adjustment: number;
  settlement: number;
  paymentStatus: string | null;
  orderCount: number;
}

export interface TikTokStatements {
  range: { from: string; to: string };
  totals: {
    statements: number;
    revenue: number;
    fee: number;
    adjustment: number;
    settlement: number;
    orders: number;
  };
  rows: StatementRow[];
}

export interface StatementParams {
  from?: string | null;
  to?: string | null;
  shopId?: string | null;
  platform?: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getTikTokStatements(params: StatementParams): Promise<TikTokStatements> {
  const platform = params.platform ?? "TikTok";
  const range = resolveRange(params.from ?? undefined, params.to ?? undefined);
  const from = range.fromDay;
  const to = range.toDay;
  const start = new Date(range.startIso);
  const end = new Date(range.endIso);

  const base = params.shopId
    ? [platform, start.toISOString(), end.toISOString(), params.shopId]
    : [platform, start.toISOString(), end.toISOString()];
  const shopClause = params.shopId ? " AND s.shop_id = $4::text" : "";

  const rows = await query<{
    statement_id: string;
    statement_time: string | null;
    revenue_amount: string;
    fee_amount: string;
    adjustment_amount: string;
    settlement_amount: string;
    payment_status: string | null;
    order_count: string;
  }>(
    `SELECT s.statement_id,
            s.statement_time::text AS statement_time,
            s.revenue_amount::text AS revenue_amount,
            s.fee_amount::text AS fee_amount,
            s.adjustment_amount::text AS adjustment_amount,
            s.settlement_amount::text AS settlement_amount,
            s.payment_status,
            COALESCE(f.order_count, 0)::text AS order_count
       FROM platform_statements s
       LEFT JOIN (
         SELECT platform, shop_id, statement_id, count(DISTINCT order_id) AS order_count
           FROM platform_order_finance
          GROUP BY 1, 2, 3
       ) f ON f.platform = s.platform AND f.shop_id = s.shop_id AND f.statement_id = s.statement_id
      WHERE s.platform = $1 AND s.statement_time >= $2::timestamptz AND s.statement_time < $3::timestamptz${shopClause}
      ORDER BY s.statement_time DESC
      LIMIT 400`,
    base,
  );

  const mapped: StatementRow[] = rows.map((row) => ({
    statementId: row.statement_id,
    time: row.statement_time,
    revenue: toNumber(row.revenue_amount),
    fee: toNumber(row.fee_amount),
    adjustment: toNumber(row.adjustment_amount),
    settlement: toNumber(row.settlement_amount),
    paymentStatus: row.payment_status,
    orderCount: toNumber(row.order_count),
  }));

  const totals = mapped.reduce(
    (acc, row) => ({
      statements: acc.statements + 1,
      revenue: acc.revenue + row.revenue,
      fee: acc.fee + row.fee,
      adjustment: acc.adjustment + row.adjustment,
      settlement: acc.settlement + row.settlement,
      orders: acc.orders + row.orderCount,
    }),
    { statements: 0, revenue: 0, fee: 0, adjustment: 0, settlement: 0, orders: 0 },
  );

  return { range: { from, to }, totals, rows: mapped };
}
