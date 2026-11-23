import { query } from "@/lib/db";
import { callTikTokApi } from "./tiktok";
import { getPlatformConfig, TIKTOK_PLATFORM } from "./store";
import { getFreshTikTokAccount } from "./token-freshness";
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

/**
 * callTikTokApi คืนตัว product มาตรง ๆ (ไม่ได้ห่อใน data.product)
 * ผลตอบจริงมี skus/status อยู่บนสุด
 */
type ProductDetail = {
  status?: string;
  product_status?: string;
  skus?: Array<{
    id?: string;
    seller_sku?: string;
    inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
  }>;
};

/** สถานะที่ TikTok ยอมให้แก้สต็อก — FREEZE/DELETED ส่งไปจะถูกตีกลับ */
const WRITABLE_STATUS = new Set(["DRAFT", "PENDING", "FAILED", "ACTIVATE", "SELLER_DEACTIVATED"]);

// TikTok ตอบข้อผิดพลาดชั่วคราวเป็นครั้งคราว (500 หรือ envelope แปลก ๆ) โดยเฉพาะตอนไลฟ์
// ที่มีคำขอแทรกเข้ามาถี่ — ลองส่งซ้ำด้วยคำขอเดิมได้ เพราะยอดที่ส่งเป็นค่าสัมบูรณ์
const WRITE_ATTEMPTS = 3;
const WRITE_RETRY_DELAYS_MS = [300, 700];

/**
 * เรียก TikTok ซ้ำเมื่อเจอข้อผิดพลาดชั่วคราว — การปฏิเสธทางธุรกิจ (StockWriteError)
 * ไม่ลองซ้ำเพราะยิงกี่ครั้งก็ได้ผลเดิม
 */
async function callTikTokWithRetry<T>(run: () => Promise<T>, attempts = WRITE_ATTEMPTS): Promise<T> {
  let lastFailure: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_DELAYS_MS[attempt - 1] ?? 700));
    }
    try {
      return await run();
    } catch (error) {
      if (error instanceof StockWriteError) throw error;
      lastFailure = error;
    }
  }
  throw lastFailure instanceof Error ? lastFailure : new Error("TikTok ไม่ตอบสนอง");
}

function toWarehouses(sku: NonNullable<ProductDetail["skus"]>[number]): Warehouse[] {
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
/**
 * ล็อกต่อ SKU ภายในโพรเซส — กันสองคำขอที่มาพร้อมกันอ่านค่าเดียวกันแล้วเขียนทับกัน
 * (แอปเรารันคอนเทนเนอร์เดียว ถ้าขยายหลายอินสแตนซ์ต้องเปลี่ยนเป็น advisory lock ของ DB)
 */
const skuLocks = new Map<string, Promise<unknown>>();

function withSkuLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = skuLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  skuLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export function adjustStock(input: {
  shopId: string;
  productId: string;
  skuId: string;
  delta: number;
  expectedQuantity: number;
}): Promise<{ quantity: number; warehouses: Warehouse[]; corrected: boolean }> {
  return withSkuLock(`${input.shopId}:${input.skuId}`, () => adjustStockInner(input));
}

async function adjustStockInner(input: {
  shopId: string;
  productId: string;
  skuId: string;
  delta: number;
  expectedQuantity: number;
}): Promise<{ quantity: number; warehouses: Warehouse[]; corrected: boolean }> {
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

  const account = await getFreshTikTokAccount(shopId);
  if (!account?.accessToken || !account.shopCipher) {
    throw new StockWriteError("not_allowed", "ไม่พบ token ของร้าน");
  }
  const ctx = {
    config: config.tiktok,
    accessToken: account.accessToken,
    query: { shop_cipher: account.shopCipher },
  };

  // อ่านสดจาก TikTok ก่อน — สินค้าที่เป็น Draft จะอ่านรายละเอียดไม่ได้
  // กรณีนั้นใช้ค่าที่ซิงก์ไว้ใน DB แทน (Draft ยังไม่ขาย จึงไม่มีคนแย่งตัดสต็อก)
  let warehouses: Warehouse[];
  let sellerSku: string | null = null;
  let fromDb = false;
  try {
    const detail = await callTikTokWithRetry(() =>
      callTikTokApi<ProductDetail>({
        ...ctx,
        path: `/product/202309/products/${encodeURIComponent(productId)}`,
      }),
    );
    const product = detail;
    const status = product.status ?? product.product_status;
    if (!product.skus?.length) {
      throw new StockWriteError("not_found", "ไม่พบสินค้านี้ใน TikTok");
    }
    if (status && !WRITABLE_STATUS.has(status)) {
      throw new StockWriteError("rejected", `สินค้าอยู่สถานะ ${status} แก้สต็อกไม่ได้`);
    }
    const sku = (product.skus ?? []).find((row) => String(row.id) === skuId);
    if (!sku) throw new StockWriteError("not_found", "ไม่พบ SKU นี้ในสินค้า");
    warehouses = toWarehouses(sku);
    sellerSku = sku.seller_sku ?? null;
  } catch (error) {
    if (!(error instanceof StockWriteError) || error.code !== "not_found") throw error;
    const rows = await query<{ quantity: number; warehouses: Warehouse[]; seller_sku: string | null }>(
      `SELECT quantity, warehouses, seller_sku FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [shopId, skuId],
    );
    const row = rows[0];
    if (!row) throw new StockWriteError("not_found", "ไม่พบสินค้านี้ทั้งใน TikTok และในฐานข้อมูลเรา");
    warehouses = Array.isArray(row.warehouses) ? row.warehouses : [];
    sellerSku = row.seller_sku;
    fromDb = true;
  }
  if (fromDb) {
    console.log("[stock-write] สินค้าอ่านสดไม่ได้ (Draft) — ใช้ค่าที่ซิงก์ไว้", { shopId, skuId });
  }
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

  type UpdateResult = { errors?: Array<{ message?: string; detail?: string }> };
  const updateBody = {
    skus: [
      {
        id: skuId,
        inventory: nextWarehouses.map((item) => ({ warehouse_id: item.warehouseId, quantity: item.quantity })),
      },
    ],
  };
  let result: UpdateResult;
  try {
    result = await callTikTokWithRetry(() =>
      callTikTokApi<UpdateResult>({
        ...ctx,
        method: "POST",
        path: `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`,
        body: updateBody,
      }),
    );
  } catch (error) {
    if (error instanceof StockWriteError) throw error;
    throw new StockWriteError(
      "api",
      `TikTok ไม่รับคำขอแก้สต็อก (ลอง ${WRITE_ATTEMPTS} ครั้งแล้ว): ${
        error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"
      }`,
    );
  }
  const failure = result.errors?.[0];
  if (failure) {
    throw new StockWriteError("rejected", failure.message ?? failure.detail ?? "TikTok ปฏิเสธการแก้สต็อก");
  }

  // ตรวจหลังเขียน: การส่งยอดรวมขึ้น TikTok แปลว่าถ้ามีคนซื้อในเสี้ยววินาทีที่คำขอกำลังเดินทาง
  // ยอดที่เราส่งไปอาจทับยอดที่เพิ่งขาย — อ่านกลับทันทีเพื่อให้ DB และหน้าจอตรงกับที่ TikTok มีจริง
  // (อ่านไม่ได้ก็ไม่ทำให้การบันทึกที่สำเร็จแล้วล้มทั้งงาน)
  let finalWarehouses = nextWarehouses;
  let finalQuantity = next;
  let corrected = false;
  if (!fromDb) {
    // อ่านกลับทันทีหลังเขียนอาจได้ค่าเก่าจาก cache ของ TikTok — ต้องอ่านซ้ำจนได้ค่าที่นิ่ง
    // สองครั้งติดกันก่อนจึงเชื่อ (ไม่เช่นนั้นจะแจ้ง "มีคนซื้อ" ทั้งที่ไม่มีคนซื้อ)
    let previous: { quantity: number; warehouses: Warehouse[] } | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      try {
        const verify = await callTikTokApi<ProductDetail>({
          ...ctx,
          path: `/product/202309/products/${encodeURIComponent(productId)}`,
        });
        const skuAfter = (verify.skus ?? []).find((row) => String(row.id) === skuId);
        if (!skuAfter) break;
        const after = toWarehouses(skuAfter);
        const afterTotal = after.reduce((sum, item) => sum + item.quantity, 0);
        if (previous && previous.quantity === afterTotal) {
          if (afterTotal !== next) {
            finalWarehouses = after;
            finalQuantity = afterTotal;
            corrected = true;
            console.warn("[stock-write] ยอดหลังเขียนไม่ตรงกับที่ส่งไป — มีคนซื้อระหว่างนั้น", {
              shopId,
              skuId,
              sent: next,
              actual: afterTotal,
            });
          }
          break;
        }
        previous = { quantity: afterTotal, warehouses: after };
        // ค่าที่อ่านได้ตรงกับที่เราส่งไปแล้ว = ไม่มีอะไรเปลี่ยนหลังเขียน จบได้เลย
        if (afterTotal === next) break;
      } catch (error) {
        console.warn("[stock-write] ตรวจยอดหลังเขียนไม่สำเร็จ", {
          shopId,
          skuId,
          error: error instanceof Error ? error.message : error,
        });
        break;
      }
    }
  }

  // เขียนยอดและบันทึกประวัติในคำสั่งเดียว: แถวประวัติถูกเขียนเฉพาะเมื่อยอดในฐานข้อมูล
  // ยังเป็นยอดที่อ่านมาได้จริงตอนต้น (ถ้ารอบซิงก์บันทึกการเปลี่ยนเดียวกันไปก่อนแล้ว
  // จะไม่เกิดประวัติซ้ำอีกแถวสำหรัยการเปลี่ยนครั้งเดียว)
  await query(
    `WITH previous AS (
       SELECT quantity FROM platform_stock
        WHERE shop_id = $1 AND sku_id = $2
        FOR UPDATE
     ), updated AS (
       UPDATE platform_stock
          SET quantity = $3, warehouses = $4::jsonb, updated_at = now()
        WHERE shop_id = $1 AND sku_id = $2
        RETURNING 1 AS done
     )
     INSERT INTO platform_stock_movements
       (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
     SELECT $5, $1, $2, $6, NULL, previous.quantity, $3, $3 - previous.quantity
       FROM previous CROSS JOIN updated
      WHERE previous.quantity IS DISTINCT FROM $3`,
    [shopId, skuId, finalQuantity, JSON.stringify(finalWarehouses), TIKTOK_PLATFORM, sellerSku],
  );

  return { quantity: finalQuantity, warehouses: finalWarehouses, corrected };
}

/**
 * เปิด/ซ่อนตะกร้าของสินค้าทั้งตัว (ไม่ใช่ราย SKU) ที่ TikTok
 * ใช้ด่านเดียวกับปรับสต็อก: ร้านทดสอบทำได้เสมอ ร้านจริงต้องเปิด PLATFORM_STOCK_WRITE_LIVE=1
 * เอกสาร TikTok: POST /product/202309/products/deactivate (หรือ /activate) ซ่อน/เปิดจากผู้ซื้อทันที
 */
export async function setProductVisibility(input: {
  shopId: string;
  productId: string;
  visible: boolean;
}): Promise<{ productId: string; productStatus: string }> {
  const { shopId, productId, visible } = input;
  if (!shopId || !productId) {
    throw new StockWriteError("rejected", "ไม่พบร้านหรือสินค้าที่ต้องการเปลี่ยนสถานะ");
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
      "ร้านจริงยังไม่เปิดให้เปลี่ยนสถานะตะกร้า — ทดสอบบนร้านทดสอบให้ผ่านก่อน",
    );
  }

  const account = await getFreshTikTokAccount(shopId);
  const accessToken = account?.accessToken ?? "";
  const shopCipher = account?.shopCipher ?? "";
  if (!accessToken || !shopCipher) {
    throw new StockWriteError("not_allowed", "ร้านนี้ยังไม่ได้เชื่อมต่อ TikTok");
  }

  const productStatus = visible ? "ACTIVATE" : "SELLER_DEACTIVATED";
  let result: { errors?: Array<{ message?: string; detail?: string }> };
  try {
    result = await callTikTokWithRetry(() =>
      callTikTokApi<{ errors?: Array<{ message?: string; detail?: string }> }>({
        config: config.tiktok!,
        accessToken,
        method: "POST",
        path: `/product/202309/products/${visible ? "activate" : "deactivate"}`,
        query: { shop_cipher: shopCipher },
        body: { product_ids: [productId] },
      }),
    );
  } catch (error) {
    throw new StockWriteError(
      "api",
      `TikTok ไม่รับคำขอเปลี่ยนสถานะตะกร้า: ${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"}`,
    );
  }

  // TikTok อาจตอบ 200 พร้อม errors[] ในตัว — ต้องอ่านก่อน ไม่ใช่ถือว่าสำเร็จ
  const failure = result.errors?.[0];
  if (failure) {
    throw new StockWriteError(
      "rejected",
      failure.message ?? failure.detail ?? "TikTok ปฏิเสธการเปลี่ยนสถานะตะกร้า",
    );
  }

  // ยืนยันจาก TikTok อีกรอบว่าสถานะเปลี่ยนจริง ก่อนบอกผู้ใช้ว่าสำเร็จ
  let confirmed: string | null = null;
  try {
    const detail = await callTikTokWithRetry(() =>
      callTikTokApi<{ status?: string }>({
        config: config.tiktok!,
        accessToken,
        query: { shop_cipher: shopCipher },
        path: `/product/202309/products/${encodeURIComponent(productId)}`,
      }),
    );
    confirmed = detail.status ?? null;
  } catch {
    confirmed = null;
  }
  // เปิดขายอาจเข้าคิวตรวจของ TikTok (PENDING) — ถือว่ารับคำขอแล้ว แต่ป้ายบนหน้าจอต้องบอกตามจริง
  if (confirmed !== productStatus && !(visible && confirmed === "PENDING")) {
    throw new StockWriteError(
      "api",
      `TikTok รับคำสั่งแล้วแต่สถานะยังไม่เปลี่ยน (สถานะที่อ่านได้: ${confirmed ?? "อ่านไม่ได้"})`,
    );
  }
  const storedStatus = confirmed ?? productStatus;

  // อัปเดตสถานะในฐานข้อมูลทันที ให้ป้ายบนหน้าจอเปลี่ยนโดยไม่ต้องรอรอบซิงก์
  await query(
    `UPDATE platform_stock
        SET product_status = $3, updated_at = now()
      WHERE platform = $1 AND shop_id = $2 AND product_id = $4`,
    [TIKTOK_PLATFORM, shopId, storedStatus, productId],
  );

  return { productId, productStatus: storedStatus };
}
