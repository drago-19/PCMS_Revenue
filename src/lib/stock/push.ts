// เขียนยอดคงเหลือของสต็อกกลางลงประกาศของทุกร้านที่ผูกไว้ (แบบเดียวกับ Shipnity: ใช้จำนวนสต็อกร่วมกัน)
//
// กติกาความปลอดภัย:
// - เขียนเฉพาะรหัสที่มีแถวใน central_stock แล้วเท่านั้น — รหัสที่ยังไม่เคยเติมของจะไม่ถูกแตะประกาศเลย
// - ยอดที่เขียนคือ on_hand ของสต็อกกลาง (ไม่ใช่ยอดเดิมของร้านนั้น) และไม่ต่ำกว่า 0
// - TikTok: ส่งเป็นส่วนต่างหลังอ่านค่าสด ตามที่ adjustStock บังคับ — ถ้าขายไประหว่างนั้นจะได้ conflict แล้วลองใหม่
// - Shopee: ตั้งจำนวนตรง ๆ ผ่าน setShopeeStock
// - ร้านจริงยังผ่านด่าน PLATFORM_STOCK_WRITE_LIVE ใน adjustStock ตามเดิม

import { query } from "@/lib/db";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import { setShopeeStock } from "@/lib/platform/shopee";
import { adjustStock, StockWriteError } from "@/lib/platform/stock-write";

export type PushResult = {
  pushed: number;
  skipped: number;
  failed: number;
  errors: Array<{ platform: string; shopId: string; skuId: string; error: string }>;
};

type PushTarget = {
  platform: string;
  shopId: string;
  skuId: string;
  productId: string | null;
  skuCode: string;
  target: number;
  current: number;
};

const MAX_CONFLICT_RETRIES = 2;

/**
 * เทียบยอดกลางกับยอดบนประกาศของแต่ละร้าน แล้วเขียนเฉพาะที่ยังไม่ตรง
 * เรียกซ้ำได้บ่อยเท่าที่ต้องการ — ยอดตรงแล้วจะเป็น no-op
 */
export async function pushPoolToListings(options: { skuCodes?: string[] } = {}): Promise<PushResult> {
  const result: PushResult = { pushed: 0, skipped: 0, failed: 0, errors: [] };
  const codes = options.skuCodes?.length ? options.skuCodes : null;

  const targets = await query<{
    platform: string;
    shop_id: string;
    sku_id: string;
    product_id: string | null;
    sku_code: string;
    target: number;
    current: number | null;
  }>(
    `SELECT l.platform,
            l.shop_id,
            l.sku_id,
            s.product_id,
            l.sku_code,
            c.on_hand::int AS target,
            s.quantity AS current
       FROM central_stock_links l
       JOIN central_stock c ON c.sku_code = l.sku_code AND c.archived_at IS NULL
       JOIN platform_stock s
         ON s.platform = l.platform AND s.shop_id = l.shop_id AND s.sku_id = l.sku_id
      WHERE ($1::text[] IS NULL OR l.sku_code = ANY($1::text[]))
      ORDER BY l.platform, l.shop_id, l.sku_id`,
    [codes],
  );

  if (targets.length === 0) return result;

  const shopeeTokens = new Map<string, Awaited<ReturnType<typeof ensureValidShopeeToken>>>();

  for (const row of targets) {
    const target = Math.max(0, Number(row.target));
    const current = Number(row.current ?? 0);
    if (target === current) {
      result.skipped += 1;
      continue;
    }

    const item: PushTarget = {
      platform: row.platform,
      shopId: row.shop_id,
      skuId: row.sku_id,
      productId: row.product_id,
      skuCode: row.sku_code,
      target,
      current,
    };

    try {
      if (item.platform === "TikTok") {
        await pushTikTok(item);
      } else if (item.platform === "Shopee") {
        await pushShopee(item, shopeeTokens);
      } else {
        result.skipped += 1;
        continue;
      }
      result.pushed += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        platform: item.platform,
        shopId: item.shopId,
        skuId: item.skuId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function pushTikTok(item: PushTarget): Promise<void> {
  if (!item.productId) throw new Error("ไม่รู้รหัสสินค้าบน TikTok ของ SKU นี้");
  let expected = item.current;
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const delta = item.target - expected;
    if (delta === 0) return;
    try {
      await adjustStock({
        shopId: item.shopId,
        productId: item.productId,
        skuId: item.skuId,
        delta,
        expectedQuantity: expected,
      });
      return;
    } catch (error) {
      // มีคนซื้อระหว่างนั้น — อ่านยอดใหม่จากข้อผิดพลาดแล้วลองใหม่ ไม่เขียนทับด้วยค่าเก่า
      if (error instanceof StockWriteError && error.code === "conflict") {
        const current = Number((error.detail as { current?: number } | undefined)?.current);
        if (Number.isFinite(current)) {
          expected = current;
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error("ยอดบน TikTok ขยับตลอดเวลา — ลองใหม่รอบหน้า");
}

async function pushShopee(
  item: PushTarget,
  tokens: Map<string, Awaited<ReturnType<typeof ensureValidShopeeToken>>>,
): Promise<void> {
  const [itemIdRaw, modelIdRaw] = item.skuId.split(":");
  const itemId = Number.parseInt(itemIdRaw ?? "", 10);
  const modelId = Number.parseInt(modelIdRaw ?? "0", 10);
  if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("รหัสสินค้า Shopee ไม่ถูกต้อง");

  let ctx = tokens.get(item.shopId);
  if (!ctx) {
    ctx = await ensureValidShopeeToken(item.shopId);
    tokens.set(item.shopId, ctx);
  }

  const response = await setShopeeStock(ctx.config, {
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
    itemId,
    quantity: item.target,
    modelId,
  });
  if (response.failureList.length > 0) {
    throw new Error("Shopee ปฏิเสธการแก้สต็อก (สินค้าอาจอยู่ในโปรโมชันหรือจำนวนต่ำกว่าที่ถูกจอง)");
  }
}
