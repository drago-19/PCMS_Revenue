import { query } from "@/lib/db";
import { callTikTokApi } from "./tiktok";
import { getPlatformAccountRow, getPlatformConfig, TIKTOK_PLATFORM } from "./store";
import { isSandboxShopName } from "./platforms";

export type StockWriteCode = "not_allowed" | "not_found" | "conflict" | "rejected" | "api";

export class StockWriteError extends Error {
  constructor(
    public code: StockWriteCode,
    message: string,
    public detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StockWriteError";
  }
}

/** เปิดให้เขียนสต็อกบนร้านจริงหรือยัง — ค่าเริ่มต้นคือยัง (ทดสอบบนร้านทดสอบให้ผ่านก่อน) */
export function liveWriteAllowed(): boolean {
  return process.env.PLATFORM_STOCK_WRITE_LIVE === "1";
}

type Warehouse = { warehouseId: string; quantity: number };

type ProductDetail = {
  product?: {
    status?: string;
    skus?: Array<{
      id?: string;
      seller_sku?: string;
      inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
    }>;
  };
};

/** สถานะที่ TikTok ยอมให้แก้สต็อก — FREEZE/DELETED ส่งไปจะถูกตีกลับ */
const WRITABLE_STATUS = new Set(["DRAFT", "PENDING", "FAILED", "ACTIVATE", "SELLER_DEACTIVATED"]);

function toWarehouses(sku: NonNullable<NonNullable<ProductDetail["product"]>["skus"]>[number]): Warehouse[] {
  return (sku.inventory ?? [])
    .filter((item) => item.warehouse_id)
    .map((item) => ({ warehouseId: String(item.warehouse_id), quantity: Number(item.quantity ?? 0) }));
}

/**
 * ปรับจำนวนสต็อกของ SKU หนึ่งตัว — ออกแบบสำหรับขายสด
 *
 * 1. อ่านค่าสดจาก TikTok ทุกครั้งก่อนเขียน
 * 2. เทียบกับจำนวนที่ผู้ใช้เห็นตอนกด — ถ้าขายไประหว่างนั้นให้ปฏิเสธ ไม่เขียนทับ
 * 3. ส่งเป็นส่วนต่าง (±) ไม่ใช่ค่าสัมบูรณ์ และส่งครบทุกคลังของ SKU
 */
export async function adjustStock(input: {
  shopId: string;
  productId: string;
  skuId: string;
  delta: number;
  expectedQuantity: number;
}): Promise<{ quantity: number; warehouses: Warehouse[] }> {
  const { shopId, productId, skuId } = input;
  const delta = Math.trunc(input.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new StockWriteError("rejected", "ต้องระบุจำนวนที่ต้องการเพิ่มหรือลด");
  }

  const config = await getPlatformConfig();
  if (!config.tiktok) throw new StockWriteError("not_allowed", "ยังไม่ได้ตั้งค่าแอป TikTok");

  const accounts = await query<{ shop_name: string | null }>(
    `SELECT shop_name FROM platform_accounts WHERE platform = $1 AND account_key = $2`,
    [TIKTOK_PLATFORM, shopId],
  );
  const shopName = accounts[0]?.shop_name ?? null;
  if (!isSandboxShopName(shopName) && !liveWriteAllowed()) {
    throw new StockWriteError(
      "not_allowed",
      "ร้านจริงยังไม่เปิดให้แก้สต็อก — ทดสอบบนร้านทดสอบให้ผ่านก่อน",
    );
  }

  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!account?.accessToken || !account.shopCipher) {
    throw new StockWriteError("not_allowed", "ไม่พบ token ของร้าน");
  }
  const ctx = { config: config.tiktok, accessToken: account.accessToken, shopCipher: account.shopCipher };

  const detail = await callTikTokApi<ProductDetail>({
    ...ctx,
    path: `/product/202309/products/${encodeURIComponent(productId)}`,
  });
  const product = detail.product;
  if (!product) throw new StockWriteError("not_found", "ไม่พบสินค้านี้ใน TikTok");
  if (product.status && !WRITABLE_STATUS.has(product.status)) {
    throw new StockWriteError("rejected", `สินค้าอยู่สถานะ ${product.status} แก้สต็อกไม่ได้`);
  }

  const sku = (product.skus ?? []).find((row) => String(row.id) === skuId);
  if (!sku) throw new StockWriteError("not_found", "ไม่พบ SKU นี้ในสินค้า");
  const warehouses = toWarehouses(sku);
  if (warehouses.length === 0) {
    throw new StockWriteError("rejected", "SKU นี้ไม่มีคลังให้แก้ — ต้องตั้งคลังใน Seller Center ก่อน");
  }

  const current = warehouses.reduce((sum, item) => sum + item.quantity, 0);
  if (current !== input.expectedQuantity) {
    throw new StockWriteError(
      "conflict",
      `สต็อกขยับไประหว่างนั้น — ตอนนี้เหลือ ${current} (ที่เห็นตอนกด ${input.expectedQuantity})`,
      { current, expected: input.expectedQuantity },
    );
  }

  // ใส่ส่วนต่างลงคลังที่มีของมากที่สุด — ถ้าลดจนติดลบ ปฏิเสธก่อนยิง API
  const target = [...warehouses].sort((a, b) => b.quantity - a.quantity)[0];
  const targetNext = target.quantity + delta;
  if (targetNext < 0) {
    throw new StockWriteError("rejected", `คลัง ${target.warehouseId} มี ${target.quantity} ลด ${Math.abs(delta)} ไม่ได้`);
  }
  const nextWarehouses = warehouses.map((item) =>
    item.warehouseId === target.warehouseId ? { ...item, quantity: targetNext } : item,
  );
  const next = nextWarehouses.reduce((sum, item) => sum + item.quantity, 0);

  const result = await callTikTokApi<{ errors?: Array<{ message?: string; detail?: string }> }>({
    ...ctx,
    method: "POST",
    path: `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`,
    body: {
      skus: [
        {
          id: skuId,
          inventory: nextWarehouses.map((item) => ({ warehouse_id: item.warehouseId, quantity: item.quantity })),
        },
      ],
    },
  });
  const failure = result.errors?.[0];
  if (failure) {
    throw new StockWriteError("rejected", failure.message ?? failure.detail ?? "TikTok ปฏิเสธการแก้สต็อก");
  }

  await query(
    `UPDATE platform_stock
        SET quantity = $3, warehouses = $4::jsonb, updated_at = now()
      WHERE shop_id = $1 AND sku_id = $2`,
    [shopId, skuId, next, JSON.stringify(nextWarehouses)],
  );
  await query(
    `INSERT INTO platform_stock_movements
       (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [TIKTOK_PLATFORM, shopId, skuId, sku.seller_sku ?? null, null, current, next, delta],
  );

  return { quantity: next, warehouses: nextWarehouses };
}
