// ซิงก์ข้อมูล Shopee (Sandbox / Live) ลงตาราง platform_* (platform = 'Shopee')
// แยกข้อมูลออกจาก TikTok และไม่แตะตารางบิล/Excel เดิม (Strict Platform Isolation)

import { query } from "@/lib/db";
import { refreshDailySummary } from "@/lib/platform/daily-summary";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import {
  getShopeeEscrowDetail,
  getShopeeOrderDetails,
  listShopeeInventory,
  listShopeeOrderSns,
  redactShopeeSecret,
  refreshShopeeAccessToken,
  type ShopeeAppConfig,
  type ShopeeEnvironment,
  type ShopeeEscrowDetail,
  type ShopeeOrder,
} from "@/lib/platform/shopee";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  markAccountError,
  SHOPEE_PLATFORM,
  updateAccountTokens,
} from "@/lib/platform/store";
import { finishSyncRun, startSyncRun } from "@/lib/platform/sync";

const CHUNK = 200;
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

function toTimestamp(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000);
}

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runChunks<T>(rows: T[], write: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await write(rows.slice(index, index + CHUNK));
  }
}

export interface ValidShopeeContext {
  config: ShopeeAppConfig;
  accessToken: string;
  shopId: string;
  shopName: string;
}

/** ตรวจสอบและรีเฟรช access_token ของ Shopee อัตโนมัติเมื่อใกล้หมดอายุ (4 ชม.) พร้อมบันทึก refresh_token ใหม่ทันที */
export async function ensureValidShopeeToken(
  shopId: string,
  overrideConfig?: ShopeeAppConfig,
): Promise<ValidShopeeContext> {
  const loaded = overrideConfig ?? (await getPlatformConfig()).shopee;
  if (!loaded) {
    throw new SyncUnavailableError("ยังไม่ได้ตั้งค่าแอป Shopee");
  }

  const account = await getPlatformAccountRow(SHOPEE_PLATFORM, shopId);
  if (!account || !account.accessToken) {
    throw new SyncUnavailableError("ไม่พบ token ของร้าน Shopee");
  }

  const accountEnv: ShopeeEnvironment =
    account.shopCipher === "live" || account.shopCipher === "sandbox"
      ? account.shopCipher
      : loaded.env;
  const effectiveConfig: ShopeeAppConfig = { ...loaded, env: accountEnv };

  const expiresAtMs = account.accessTokenExpiresAt
    ? Date.parse(account.accessTokenExpiresAt)
    : 0;
  const needsRefresh =
    !expiresAtMs || Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() < TOKEN_REFRESH_MARGIN_MS;

  if (!needsRefresh) {
    return {
      config: effectiveConfig,
      accessToken: account.accessToken,
      shopId: account.accountKey,
      shopName: account.shopName ?? `Shopee #${account.accountKey}`,
    };
  }

  if (!account.refreshToken) {
    throw new SyncUnavailableError("Token หมดอายุและไม่มี refresh_token — กรุณาเชื่อมต่อร้านใหม่");
  }

  try {
    const refreshed = await refreshShopeeAccessToken(effectiveConfig, {
      refreshToken: account.refreshToken,
      shopId: account.accountKey,
    });
    await updateAccountTokens({
      platform: SHOPEE_PLATFORM,
      accountKey: account.accountKey,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
    });

    return {
      config: effectiveConfig,
      accessToken: refreshed.accessToken,
      shopId: account.accountKey,
      shopName: account.shopName ?? `Shopee #${account.accountKey}`,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safeMsg = redactShopeeSecret(raw, effectiveConfig.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, account.accountKey, safeMsg);
    throw new Error(safeMsg);
  }
}

export async function upsertShopeeOrders(shopId: string, orders: ShopeeOrder[]): Promise<number> {
  if (orders.length === 0) return 0;

  await runChunks(orders, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((order, rowIndex) => {
      const base = rowIndex * 22;
      values.push(
        SHOPEE_PLATFORM,
        shopId,
        order.id,
        order.status,
        toTimestamp(order.createTime),
        toTimestamp(order.paidTime),
        toTimestamp(order.shippedTime),
        null,
        toTimestamp(order.cancelledTime),
        order.cancelReason,
        order.cancelUser,
        order.currency ?? "THB",
        order.totalAmount === null ? null : num(order.totalAmount),
        order.trackingNumber,
        order.shippingProvider,
        JSON.stringify(order.raw ?? {}),
        order.buyerUserId,
        order.recipientName,
        order.recipientPhone,
        order.province,
        order.district,
        order.postalCode,
      );
      const placeholders = Array.from({ length: 22 }, (_, index) => `$${base + index + 1}`);
      return `(${placeholders.join(",")})`;
    });

    await query(
      `INSERT INTO platform_orders (
         platform, shop_id, order_id, order_status, create_time, paid_time, shipped_time,
         delivered_time, cancelled_time, cancel_reason, cancel_user, currency, total_amount,
         tracking_number, shipping_provider, raw_json, buyer_user_id, recipient_name,
         recipient_phone, province, district, postal_code
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (platform, shop_id, order_id) DO UPDATE SET
         order_status = EXCLUDED.order_status,
         paid_time = EXCLUDED.paid_time,
         shipped_time = EXCLUDED.shipped_time,
         cancelled_time = EXCLUDED.cancelled_time,
         cancel_reason = EXCLUDED.cancel_reason,
         cancel_user = EXCLUDED.cancel_user,
         total_amount = EXCLUDED.total_amount,
         tracking_number = EXCLUDED.tracking_number,
         shipping_provider = EXCLUDED.shipping_provider,
         raw_json = EXCLUDED.raw_json,
         buyer_user_id = COALESCE(EXCLUDED.buyer_user_id, platform_orders.buyer_user_id),
         recipient_name = COALESCE(EXCLUDED.recipient_name, platform_orders.recipient_name),
         recipient_phone = COALESCE(EXCLUDED.recipient_phone, platform_orders.recipient_phone),
         province = COALESCE(EXCLUDED.province, platform_orders.province),
         district = COALESCE(EXCLUDED.district, platform_orders.district),
         postal_code = COALESCE(EXCLUDED.postal_code, platform_orders.postal_code),
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
          SHOPEE_PLATFORM,
          shopId,
          entry.orderId,
          entry.item.lineItemId,
          entry.item.skuId,
          entry.item.productName,
          entry.item.skuName,
          entry.item.imageUrl,
          entry.item.quantity,
          entry.item.salePrice === null ? null : num(entry.item.salePrice),
          entry.item.currency ?? "THB",
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
           image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), platform_order_items.image_url),
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

export async function upsertShopeeOrderFinance(
  shopId: string,
  details: ShopeeEscrowDetail[],
  orderCreateTimes: Map<string, number>,
): Promise<number> {
  if (details.length === 0) return 0;

  await runChunks(details, async (chunk) => {
    const values: unknown[] = [];
    const tuples = chunk.map((detail, rowIndex) => {
      const base = rowIndex * 12;
      values.push(
        SHOPEE_PLATFORM,
        shopId,
        "ESCROW",
        detail.orderSn,
        "ORDER",
        toTimestamp(orderCreateTimes.get(detail.orderSn)),
        detail.settlementAmount,
        detail.revenueAmount,
        detail.feeAndTaxAmount,
        detail.shippingCostAmount,
        detail.currency || "THB",
        JSON.stringify(detail.raw ?? {}),
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
         order_create_time = COALESCE(EXCLUDED.order_create_time, platform_order_finance.order_create_time),
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

  return details.length;
}

/** ดึงออเดอร์ + รายได้ต่อออเดอร์ (escrow detail) ของร้าน Shopee 1 ร้าน */
export async function syncShopeeOrdersAndFinance(
  ctx: ValidShopeeContext,
  {
    fromUnix,
    toUnix,
    timeRangeField = "update_time",
  }: {
    fromUnix: number;
    toUnix: number;
    timeRangeField?: "create_time" | "update_time";
  },
): Promise<{ orders: number; orderFinance: number }> {
  const orderSns = await listShopeeOrderSns(ctx.config, {
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
    timeRangeField,
    timeFrom: fromUnix,
    timeTo: toUnix,
  });

  if (orderSns.length === 0) {
    return { orders: 0, orderFinance: 0 };
  }

  const orders = await getShopeeOrderDetails(ctx.config, {
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
    orderSns,
  });

  const writtenOrders = await upsertShopeeOrders(ctx.shopId, orders);
  const createTimes = new Map<string, number>();
  for (const order of orders) {
    createTimes.set(order.id, order.createTime);
  }

  const eligibleForEscrow = orders
    .filter((o) => o.status !== "UNPAID")
    .slice(0, 200);

  const escrows: ShopeeEscrowDetail[] = [];
  for (let i = 0; i < eligibleForEscrow.length; i += 4) {
    const batch = eligibleForEscrow.slice(i, i + 4);
    const settled = await Promise.allSettled(
      batch.map((o) =>
        getShopeeEscrowDetail(ctx.config, {
          accessToken: ctx.accessToken,
          shopId: ctx.shopId,
          orderSn: o.id,
        }),
      ),
    );
    for (const res of settled) {
      if (res.status === "fulfilled" && res.value) {
        escrows.push(res.value);
      }
    }
  }

  const writtenFinance = await upsertShopeeOrderFinance(ctx.shopId, escrows, createTimes);
  await refreshDailySummary(ctx.shopId, 45);

  return { orders: writtenOrders, orderFinance: writtenFinance };
}

/** ดึงสต็อกสินค้าทั้งหมดของร้าน Shopee ลง platform_stock (platform = 'Shopee') */
export async function syncShopeeStock(targetShopId?: string): Promise<{ skus: number; changed: number }> {
  let shopId = targetShopId;
  if (!shopId) {
    const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
    const target = accounts.find((row) => row.status === "connected");
    if (!target) {
      throw new SyncUnavailableError("ยังไม่มีร้าน Shopee ที่เชื่อมต่อ");
    }
    shopId = target.accountKey;
  }

  const ctx = await ensureValidShopeeToken(shopId);
  const items = await listShopeeInventory(ctx.config, {
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
  });

  if (items.length === 0) return { skus: 0, changed: 0 };

  const previous = await query<{ sku_id: string; quantity: number }>(
    `SELECT sku_id, quantity FROM platform_stock WHERE platform = $1 AND shop_id = $2`,
    [SHOPEE_PLATFORM, ctx.shopId],
  );
  const before = new Map(previous.map((row) => [row.sku_id, Number(row.quantity ?? 0)]));

  await runChunks(items, async (chunk) => {
    await query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, product_id, seller_sku, product_name, image_url, quantity, warehouses, updated_at)
       SELECT $1, $2, item.sku_id, item.product_id, item.seller_sku, item.product_name, item.image_url, item.quantity, item.warehouses::jsonb, now()
         FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::text[])
              AS item(sku_id, product_id, seller_sku, product_name, image_url, quantity, warehouses)
       ON CONFLICT (shop_id, sku_id) DO UPDATE
         SET platform = EXCLUDED.platform,
             product_id = EXCLUDED.product_id,
             seller_sku = EXCLUDED.seller_sku,
             product_name = EXCLUDED.product_name,
             image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), platform_stock.image_url),
             quantity = EXCLUDED.quantity,
             warehouses = EXCLUDED.warehouses,
             updated_at = now()`,
      [
        SHOPEE_PLATFORM,
        ctx.shopId,
        chunk.map((item) => item.skuId),
        chunk.map((item) => item.productId),
        chunk.map((item) => item.sellerSku),
        chunk.map((item) => item.productName),
        chunk.map((item) => item.imageUrl),
        chunk.map((item) => item.quantity),
        chunk.map((item) => JSON.stringify(item.warehouses)),
      ],
    );
  });

  const moves = items.filter((item) => before.has(item.skuId) && before.get(item.skuId) !== item.quantity);
  if (moves.length > 0) {
    await runChunks(moves, async (chunk) => {
      await query(
        `INSERT INTO platform_stock_movements (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
         SELECT $1, $2, item.sku_id, item.seller_sku, item.product_name, item.from_qty, item.to_qty, item.to_qty - item.from_qty
           FROM unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::int[])
                AS item(sku_id, seller_sku, product_name, from_qty, to_qty)`,
        [
          SHOPEE_PLATFORM,
          ctx.shopId,
          chunk.map((item) => item.skuId),
          chunk.map((item) => item.sellerSku),
          chunk.map((item) => item.productName),
          chunk.map((item) => before.get(item.skuId) ?? 0),
          chunk.map((item) => item.quantity),
        ],
      );
    });
  }

  return { skus: items.length, changed: moves.length };
}

export interface ShopeeSyncWindow {
  from: number;
  to: number;
  kind: string;
  mode?: "create" | "update";
  shopId?: string;
}

export interface ShopeeSyncResult {
  stats: {
    orders: number;
    orderFinance: number;
    skus: number;
    changed: number;
  };
  shopName: string;
  shopId: string;
}

/** ซิงก์ Shopee (ออเดอร์ + escrow + สต็อก) แล้วบันทึกลง platform_sync_runs */
export async function runShopeeSync(window: ShopeeSyncWindow): Promise<ShopeeSyncResult> {
  let targetShopId = window.shopId;
  if (!targetShopId) {
    const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
    const target = accounts.find((row) => row.status === "connected");
    if (!target) {
      throw new SyncUnavailableError("ยังไม่มีร้าน Shopee ที่เชื่อมต่อ");
    }
    targetShopId = target.accountKey;
  }

  const ctx = await ensureValidShopeeToken(targetShopId);
  const runId = await startSyncRun(
    SHOPEE_PLATFORM,
    window.kind,
    new Date(window.from * 1000),
    new Date(window.to * 1000),
  );

  try {
    const orderStats = await syncShopeeOrdersAndFinance(ctx, {
      fromUnix: window.from,
      toUnix: window.to,
      timeRangeField: window.mode === "create" ? "create_time" : "update_time",
    });

    let stockStats = { skus: 0, changed: 0 };
    try {
      stockStats = await syncShopeeStock(ctx.shopId);
    } catch {
      // สินค้าใน sandbox อาจว่างหรือจำกัดสิทธิ์ ไม่ให้ทั้งรอบล้ม
    }

    const total = orderStats.orders + orderStats.orderFinance + stockStats.skus;
    await finishSyncRun(runId, total, null);

    return {
      stats: {
        orders: orderStats.orders,
        orderFinance: orderStats.orderFinance,
        skus: stockStats.skus,
        changed: stockStats.changed,
      },
      shopName: ctx.shopName,
      shopId: ctx.shopId,
    };
  } catch (error) {
    const message = redactShopeeSecret(
      error instanceof Error ? error.message : String(error),
      ctx.config.partnerKey,
    );
    await finishSyncRun(runId, 0, message);
    throw new Error(message);
  }
}
