// ซิงก์ข้อมูล TikTok ลงฐานข้อมูลเรา (ตาราง platform_* เท่านั้น — ไม่แตะข้อมูลบิลเดิม)
//
// ทุกฟังก์ชันเขียนแบบ bulk upsert เป็นชุด (chunk) ตามกฎห้ามเขียนทีละแถว
// และออกแบบให้เรียกซ้ำได้ (idempotent) เพื่อให้ backfill / รอบรายวันใช้โค้ดเดียวกัน

import { query } from "@/lib/db";
import {
  listStatementTransactions,
  listStatements,
  searchOrders,
  searchPackages,
  type TikTokAppConfig,
  type TikTokOrder,
  type TikTokPackage,
  type TikTokStatement,
  type TikTokStatementTransaction,
} from "@/lib/platform/tiktok";

const PLATFORM = "TikTok";
const CHUNK = 200;

function toTimestamp(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000);
}

function num(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runChunks<T>(rows: T[], write: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await write(rows.slice(index, index + CHUNK));
  }
}

export async function upsertStatements(shopId: string, statements: TikTokStatement[]): Promise<number> {
  if (statements.length === 0) return 0;

  await runChunks(statements, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((statement, rowIndex) => {
      const base = rowIndex * 10;
      values.push(
        PLATFORM,
        shopId,
        statement.id,
        toTimestamp(statement.statementTime),
        num(statement.settlementAmount),
        num(statement.revenueAmount),
        num(statement.feeAmount),
        num(statement.adjustmentAmount),
        statement.currency,
        statement.paymentStatus,
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
    });

    await query(
      `INSERT INTO platform_statements (
         platform, shop_id, statement_id, statement_time, settlement_amount,
         revenue_amount, fee_amount, adjustment_amount, currency, payment_status
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (platform, shop_id, statement_id) DO UPDATE SET
         statement_time = EXCLUDED.statement_time,
         settlement_amount = EXCLUDED.settlement_amount,
         revenue_amount = EXCLUDED.revenue_amount,
         fee_amount = EXCLUDED.fee_amount,
         adjustment_amount = EXCLUDED.adjustment_amount,
         currency = EXCLUDED.currency,
         payment_status = EXCLUDED.payment_status,
         updated_at = now()`,
      values,
    );
  });

  return statements.length;
}

export async function upsertOrders(shopId: string, orders: TikTokOrder[]): Promise<number> {
  if (orders.length === 0) return 0;

  await runChunks(orders, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((order, rowIndex) => {
      const base = rowIndex * 16;
      values.push(
        PLATFORM,
        shopId,
        order.id,
        order.status,
        toTimestamp(order.createTime),
        toTimestamp(order.paidTime),
        toTimestamp(order.shippedTime),
        toTimestamp(order.deliveredTime),
        toTimestamp(order.cancelledTime),
        order.cancelReason,
        order.cancelUser,
        order.currency,
        order.totalAmount === null ? null : num(order.totalAmount),
        order.trackingNumber,
        order.shippingProvider,
        JSON.stringify(order.raw ?? {}),
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16})`;
    });

    await query(
      `INSERT INTO platform_orders (
         platform, shop_id, order_id, order_status, create_time, paid_time, shipped_time,
         delivered_time, cancelled_time, cancel_reason, cancel_user, currency, total_amount,
         tracking_number, shipping_provider, raw_json
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (platform, shop_id, order_id) DO UPDATE SET
         order_status = EXCLUDED.order_status,
         paid_time = EXCLUDED.paid_time,
         shipped_time = EXCLUDED.shipped_time,
         delivered_time = EXCLUDED.delivered_time,
         cancelled_time = EXCLUDED.cancelled_time,
         cancel_reason = EXCLUDED.cancel_reason,
         cancel_user = EXCLUDED.cancel_user,
         total_amount = EXCLUDED.total_amount,
         tracking_number = EXCLUDED.tracking_number,
         shipping_provider = EXCLUDED.shipping_provider,
         raw_json = EXCLUDED.raw_json,
         updated_at = now()`,
      values,
    );

    const items = chunk.flatMap((order) =>
      order.items.map((item) => ({ orderId: order.id, item })),
    );
    if (items.length > 0) {
      const itemValues: unknown[] = [];
      const itemTuples = items.map((entry, rowIndex) => {
        const base = rowIndex * 11;
        itemValues.push(
          PLATFORM,
          shopId,
          entry.orderId,
          entry.item.lineItemId || `${entry.orderId}-${rowIndex}`,
          entry.item.skuId,
          entry.item.productName,
          entry.item.skuName,
          entry.item.imageUrl,
          entry.item.quantity,
          entry.item.salePrice === null ? null : num(entry.item.salePrice),
          entry.item.currency,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });

      await query(
        `INSERT INTO platform_order_items (
           platform, shop_id, order_id, line_item_id, sku_id, product_name, sku_name,
           image_url, quantity, sale_price, currency
         ) VALUES ${itemTuples.join(",")}
         ON CONFLICT (platform, shop_id, order_id, line_item_id) DO UPDATE SET
           sku_id = EXCLUDED.sku_id,
           product_name = EXCLUDED.product_name,
           sku_name = EXCLUDED.sku_name,
           image_url = COALESCE(EXCLUDED.image_url, platform_order_items.image_url),
           quantity = EXCLUDED.quantity,
           sale_price = EXCLUDED.sale_price,
           currency = EXCLUDED.currency,
           updated_at = now()`,
        itemValues,
      );
    }
  });

  return orders.length;
}

export async function upsertPackages(shopId: string, packages: TikTokPackage[]): Promise<number> {
  if (packages.length === 0) return 0;

  await runChunks(packages, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((pkg, rowIndex) => {
      const base = rowIndex * 9;
      values.push(
        PLATFORM,
        shopId,
        pkg.id,
        pkg.status,
        toTimestamp(pkg.createTime),
        toTimestamp(pkg.updateTime),
        pkg.trackingNumber,
        pkg.shippingProvider,
        pkg.orderIds,
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`;
    });

    await query(
      `INSERT INTO platform_packages (
         platform, shop_id, package_id, status, create_time, update_time,
         tracking_number, shipping_provider, order_ids
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (platform, shop_id, package_id) DO UPDATE SET
         status = EXCLUDED.status,
         update_time = EXCLUDED.update_time,
         tracking_number = EXCLUDED.tracking_number,
         shipping_provider = EXCLUDED.shipping_provider,
         order_ids = EXCLUDED.order_ids,
         updated_at = now()`,
      values,
    );
  });

  return packages.length;
}

export async function upsertOrderFinance(
  shopId: string,
  transactions: TikTokStatementTransaction[],
): Promise<number> {
  const withOrder = transactions.filter((transaction) => Boolean(transaction.orderId));
  if (withOrder.length === 0) return 0;

  await runChunks(withOrder, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((transaction, rowIndex) => {
      const base = rowIndex * 12;
      values.push(
        PLATFORM,
        shopId,
        transaction.statementId,
        transaction.orderId,
        transaction.type,
        toTimestamp(transaction.orderCreateTime),
        num(transaction.settlementAmount),
        num(transaction.revenueAmount),
        num(transaction.feeAndTaxAmount),
        num(transaction.shippingCostAmount),
        transaction.currency,
        JSON.stringify(transaction.raw ?? {}),
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`;
    });

    await query(
      `INSERT INTO platform_order_finance (
         platform, shop_id, statement_id, order_id, transaction_type, order_create_time,
         settlement_amount, revenue_amount, fee_and_tax_amount, shipping_cost_amount,
         currency, raw_json
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (platform, shop_id, statement_id, order_id, transaction_type) DO UPDATE SET
         order_create_time = EXCLUDED.order_create_time,
         settlement_amount = EXCLUDED.settlement_amount,
         revenue_amount = EXCLUDED.revenue_amount,
         fee_and_tax_amount = EXCLUDED.fee_and_tax_amount,
         shipping_cost_amount = EXCLUDED.shipping_cost_amount,
         currency = EXCLUDED.currency,
         raw_json = EXCLUDED.raw_json,
         updated_at = now()`,
      values,
    );
  });

  return withOrder.length;
}

export interface SyncContext {
  config: TikTokAppConfig;
  accessToken: string;
  shopCipher: string;
  shopId: string;
}

export interface SyncResult {
  statements: number;
  orderFinance: number;
  orders: number;
  packages: number;
}

/** ดึง statement + รายการเงินต่อออเดอร์ในช่วงเวลา (ช่วงไม่ควรเกิน ~1 เดือนต่อครั้ง) */
export async function syncStatements(ctx: SyncContext, fromUnix: number, toUnix: number): Promise<{ statements: number; orderFinance: number }> {
  // ไล่ทุกหน้าของรายการ statement (API คืนครั้งละไม่เกิน 100 ใบ)
  const allStatements: TikTokStatement[] = [];
  let statementPage: string | undefined;
  const seenPages = new Set<string>();
  let statementPages = 0;

  while (statementPages < 100) {
    const page = await listStatements({
      config: ctx.config,
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      fromUnix,
      toUnix,
      pageToken: statementPage,
      pageSize: 100,
    });
    allStatements.push(...page.statements);
    statementPages += 1;

    const next = page.nextPageToken ?? undefined;
    if (!next || seenPages.has(next)) break;
    seenPages.add(next);
    statementPage = next;
  }

  const statements = await upsertStatements(ctx.shopId, allStatements);

  let orderFinance = 0;
  for (const statement of allStatements) {
    let pageToken: string | undefined;
    const seen = new Set<string>();
    let pages = 0;

    // กันวนไม่จบ: หยุดเมื่อ token หน้าถัดไปซ้ำ หรือครบ 500 หน้า
    while (pages < 500) {
      const page = await listStatementTransactions({
        config: ctx.config,
        accessToken: ctx.accessToken,
        shopCipher: ctx.shopCipher,
        statementId: statement.id,
        pageToken,
        pageSize: 100,
      });
      orderFinance += await upsertOrderFinance(ctx.shopId, page.transactions);
      pages += 1;

      const next = page.nextPageToken ?? undefined;
      if (!next || seen.has(next)) break;
      seen.add(next);
      pageToken = next;
    }
  }

  return { statements, orderFinance };
}

/** ดึงออเดอร์ตามช่วงเวลาที่สร้าง (ไล่ทุกหน้า) */
export async function syncOrders(ctx: SyncContext, fromUnix: number, toUnix: number): Promise<number> {
  let pageToken: string | undefined;
  let written = 0;
  let pages = 0;
  const seen = new Set<string>();

  while (pages < 500) {
    const page = await searchOrders({
      config: ctx.config,
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      createTimeGe: fromUnix,
      createTimeLt: toUnix,
      pageToken,
      pageSize: 100,
    });
    written += await upsertOrders(ctx.shopId, page.orders);
    pages += 1;

    const next = page.nextPageToken ?? undefined;
    if (!next || seen.has(next)) break;
    seen.add(next);
    pageToken = next;
  }

  return written;
}

/** ดึงพัสดุตามช่วงเวลาที่สร้าง (ไล่ทุกหน้า) */
export async function syncPackages(ctx: SyncContext, fromUnix: number, toUnix: number): Promise<number> {
  let pageToken: string | undefined;
  let written = 0;
  let pages = 0;
  const seen = new Set<string>();

  while (pages < 500) {
    const page = await searchPackages({
      config: ctx.config,
      accessToken: ctx.accessToken,
      shopCipher: ctx.shopCipher,
      createTimeGe: fromUnix,
      createTimeLt: toUnix,
      pageSize: 50,
    });
    written += await upsertPackages(ctx.shopId, page.packages);
    pages += 1;

    const next = page.nextPageToken ?? undefined;
    if (!next || seen.has(next)) break;
    seen.add(next);
    pageToken = next;
  }

  return written;
}

export async function startSyncRun(platform: string, kind: string, from: Date, to: Date): Promise<number> {
  const rows = await query<{ id: string }>(
    `INSERT INTO platform_sync_runs (platform, kind, range_from, range_to, status)
     VALUES ($1, $2, $3, $4, 'running') RETURNING id::text AS id`,
    [platform, kind, from, to],
  );
  return Number(rows[0]?.id ?? 0);
}

export async function finishSyncRun(
  id: number,
  rowsWritten: number,
  error: string | null,
): Promise<void> {
  await query(
    `UPDATE platform_sync_runs
     SET rows_written = $2, status = $3, error = $4, finished_at = now()
     WHERE id = $1`,
    [id, rowsWritten, error ? "failed" : "done", error ? error.slice(0, 500) : null],
  );
}
