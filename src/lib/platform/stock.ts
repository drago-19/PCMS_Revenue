// สต็อกจาก TikTok โดยตรง (ไม่ผ่าน Shipnity)
// - ดึงจำนวนคงเหลือต่อ SKU ด้วยการค้นหาสินค้าครั้งเดียว (search ส่ง inventory มาด้วย)
// - เก็บยอดล่าสุดไว้เทียบ และบันทึกประวัติเมื่อยอดเปลี่ยน
// - ยังอ่านอย่างเดียว: การเขียนกลับต้องได้สิทธิ์ Product (write) จาก TikTok ก่อน

import { query } from "@/lib/db";
import { getPlatformAccountRow, getPlatformConfig, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { callTikTokApi } from "@/lib/platform/tiktok";

type ApiSku = {
  id?: string;
  seller_sku?: string;
  inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
};

type ApiProduct = {
  id?: string;
  title?: string;
  skus?: ApiSku[];
};

export type StockRow = {
  skuId: string;
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
  updatedAt: string;
  /** รหัสในทะเบียนสินค้าของเรา (products.sku_code) ถ้าจับคู่ได้ */
  productCode: string | null;
  costPrice: number | null;
};

export type StockMovement = {
  sellerSku: string | null;
  productName: string | null;
  fromQty: number | null;
  toQty: number;
  delta: number;
  changedAt: string;
};

const PAGE_SIZE = 100;

/** ดึงสต็อกล่าสุดจาก TikTok แล้วบันทึกยอด + ประวัติเมื่อเปลี่ยน */
export async function syncStock(shopId: string): Promise<{ skus: number; changed: number; error?: string }> {
  const config = await getPlatformConfig();
  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!config.tiktok || !account?.accessToken || !account.shopCipher) {
    return { skus: 0, changed: 0, error: "ยังไม่มีสิทธิ์เชื่อมต่อร้านนี้" };
  }

  let pageToken: string | undefined;
  let skus = 0;
  let changed = 0;

  for (let page = 0; page < 20; page += 1) {
    const response = await callTikTokApi<{
      products?: ApiProduct[];
      next_page_token?: string;
    }>({
      config: config.tiktok,
      accessToken: account.accessToken,
      path: "/product/202309/products/search",
      method: "POST",
      query: {
        shop_cipher: account.shopCipher,
        page_size: String(PAGE_SIZE),
        ...(pageToken ? { page_token: pageToken } : {}),
      },
      body: { page_size: PAGE_SIZE, ...(pageToken ? { page_token: pageToken } : {}) },
    });

    for (const product of response.products ?? []) {
      for (const sku of product.skus ?? []) {
        if (!sku.id) continue;
        const warehouses = (sku.inventory ?? []).map((item) => ({
          warehouseId: String(item.warehouse_id ?? ""),
          quantity: Number(item.quantity ?? 0),
        }));
        const quantity = warehouses.reduce((sum, item) => sum + item.quantity, 0);

        const before = await query<{ quantity: number }>(
          `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
          [shopId, sku.id],
        );

        await query(
          `INSERT INTO platform_stock (shop_id, sku_id, product_id, seller_sku, product_name, quantity, warehouses, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
           ON CONFLICT (shop_id, sku_id) DO UPDATE
             SET product_id = EXCLUDED.product_id,
                 seller_sku = EXCLUDED.seller_sku,
                 product_name = EXCLUDED.product_name,
                 quantity = EXCLUDED.quantity,
                 warehouses = EXCLUDED.warehouses,
                 updated_at = now()`,
          [
            shopId,
            sku.id,
            product.id ?? null,
            sku.seller_sku ?? null,
            product.title ?? null,
            quantity,
            JSON.stringify(warehouses),
          ],
        );

        if (before.length > 0 && before[0].quantity !== quantity) {
          await query(
            `INSERT INTO platform_stock_movements (shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              shopId,
              sku.id,
              sku.seller_sku ?? null,
              product.title ?? null,
              before[0].quantity,
              quantity,
              quantity - before[0].quantity,
            ],
          );
          changed += 1;
        }

        skus += 1;
      }
    }

    pageToken = response.next_page_token;
    if (!pageToken) break;
  }

  return { skus, changed };
}

/** ยอดคงเหลือล่าสุด + จับคู่รหัสกับทะเบียนสินค้าของเรา */
export async function getStockRows(shopId: string): Promise<StockRow[]> {
  const rows = await query<{
    sku_id: string;
    seller_sku: string | null;
    product_name: string | null;
    quantity: number;
    warehouses: Array<{ warehouseId: string; quantity: number }>;
    updated_at: string;
    product_code: string | null;
    cost_price: number | null;
  }>(
    `SELECT s.sku_id, s.seller_sku, s.product_name, s.quantity, s.warehouses, s.updated_at::text AS updated_at,
            p.sku_code AS product_code, p.cost_price
       FROM platform_stock s
       LEFT JOIN products p ON p.sku_code = s.seller_sku
      WHERE s.shop_id = $1
      ORDER BY s.quantity DESC, s.seller_sku ASC`,
    [shopId],
  );

  return rows.map((row) => ({
    skuId: row.sku_id,
    sellerSku: row.seller_sku,
    productName: row.product_name,
    quantity: Number(row.quantity ?? 0),
    warehouses: row.warehouses ?? [],
    updatedAt: row.updated_at,
    productCode: row.product_code,
    costPrice: row.cost_price === null ? null : Number(row.cost_price),
  }));
}

export async function getStockMovements(shopId: string, limit = 25): Promise<StockMovement[]> {
  const rows = await query<{
    seller_sku: string | null;
    product_name: string | null;
    from_qty: number | null;
    to_qty: number;
    delta: number;
    changed_at: string;
  }>(
    `SELECT seller_sku, product_name, from_qty, to_qty, delta, changed_at::text AS changed_at
       FROM platform_stock_movements
      WHERE shop_id = $1
      ORDER BY changed_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}`,
    [shopId],
  );

  return rows.map((row) => ({
    sellerSku: row.seller_sku,
    productName: row.product_name,
    fromQty: row.from_qty,
    toQty: row.to_qty,
    delta: row.delta,
    changedAt: row.changed_at,
  }));
}

export async function getLastStockSync(shopId: string): Promise<string | null> {
  const rows = await query<{ at: string | null }>(
    `SELECT max(updated_at)::text AS at FROM platform_stock WHERE shop_id = $1`,
    [shopId],
  );
  return rows[0]?.at ?? null;
}
