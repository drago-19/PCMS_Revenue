// ขั้นที่ 2 — กันของที่กำลังตีกลับไว้ไม่ให้ขายซ้ำ
//
// TikTok เติมจำนวนที่ขายได้คืนทันทีที่มันปิดคำขอคืน ซึ่งเกิดก่อนของถึงร้าน
// การกันคือการลดจำนวนบน TikTok ตามจำนวนที่กำลังเดินกลับ แล้วคืนเมื่อรับของจริง
// ต้องเขียนสต็อกได้จริง (ร้านทดสอบทำได้เสมอ · ร้านจริงต้องเปิดสวิตช์ PLATFORM_STOCK_WRITE_LIVE)

import { query } from "@/lib/db";
import { adjustStock, StockWriteError } from "./stock-write";
import { getInTransitQty } from "./stock";
import { TIKTOK_PLATFORM } from "./store";

export type StockHold = {
  skuId: string;
  quantity: number;
  createdAt: string;
};

/** ที่กันค้างอยู่ของทั้งร้าน — คีย์คือ sku_id */
export async function listOpenHolds(
  shopId: string,
  platform = TIKTOK_PLATFORM,
): Promise<Map<string, number>> {
  const rows = await query<{ sku_id: string; quantity: number }>(
    `SELECT sku_id, quantity FROM platform_stock_holds
      WHERE platform = $1 AND shop_id = $2 AND status = 'held'`,
    [platform, shopId],
  );
  return new Map(rows.map((row) => [row.sku_id, Number(row.quantity)]));
}

/**
 * กันสต็อกของ SKU หนึ่งตามจำนวนที่กำลังเดินกลับ
 * 1. อ่านจำนวนของที่กำลังตีกลับจากฐานเรา (ไม่ใช่จากหน้าจอผู้ใช้)
 * 2. จองแถวที่กันไว้ก่อน — unique index กันการกันซ้ำสองรอบ
 * 3. ลดจำนวนบน TikTok ด้วยส่วนต่าง ± (มีตัวตรวจว่าไม่มีใครซื้อระหว่างนั้น)
 * ถ้าเขียนไม่สำเร็จ ต้องลบแถวที่จองไว้ ไม่ให้ค้างเป็นของที่ถูกกันทั้งที่ยังไม่ลด
 */
export async function openHold(input: {
  shopId: string;
  productId: string;
  skuId: string;
  expectedQuantity: number;
  actor?: string | null;
}): Promise<{ quantity: number; held: number }> {
  const quantity = await getInTransitQty(input.shopId, input.skuId);
  if (quantity <= 0) {
    throw new StockWriteError("rejected", "SKU นี้ไม่มีของที่กำลังตีกลับให้กัน");
  }

  const existing = await query<{ quantity: number }>(
    `SELECT quantity FROM platform_stock_holds
      WHERE platform = $1 AND shop_id = $2 AND sku_id = $3 AND status = 'held'`,
    [TIKTOK_PLATFORM, input.shopId, input.skuId],
  );
  if (existing.length > 0) {
    throw new StockWriteError("conflict", `SKU นี้กันสต็อกไว้แล้ว ${existing[0].quantity} ชิ้น`);
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO platform_stock_holds (platform, shop_id, sku_id, product_id, quantity, status, actor)
     VALUES ($1, $2, $3, $4, $5, 'held', $6)
     RETURNING id::text AS id`,
    [TIKTOK_PLATFORM, input.shopId, input.skuId, input.productId, quantity, input.actor ?? null],
  );
  const holdId = inserted[0]?.id;

  try {
    const result = await adjustStock({
      shopId: input.shopId,
      productId: input.productId,
      skuId: input.skuId,
      delta: -quantity,
      expectedQuantity: input.expectedQuantity,
    });
    return { quantity: result.quantity, held: quantity };
  } catch (error) {
    if (holdId) {
      await query(`DELETE FROM platform_stock_holds WHERE id = $1::bigint`, [holdId]).catch(() => undefined);
    }
    throw error;
  }
}

/** คืนของที่กันไว้กลับเข้าสต็อกขาย — ใช้ตอนรับของคืนจริงแล้ว */
export async function releaseHold(input: {
  shopId: string;
  productId: string;
  skuId: string;
  expectedQuantity: number;
}): Promise<{ quantity: number; released: number }> {
  const rows = await query<{ id: string; quantity: number }>(
    `SELECT id::text AS id, quantity FROM platform_stock_holds
      WHERE platform = $1 AND shop_id = $2 AND sku_id = $3 AND status = 'held'
      LIMIT 1`,
    [TIKTOK_PLATFORM, input.shopId, input.skuId],
  );
  const hold = rows[0];
  if (!hold) {
    throw new StockWriteError("rejected", "SKU นี้ไม่ได้ถูกกันสต็อกไว้");
  }

  const released = Number(hold.quantity);
  const result = await adjustStock({
    shopId: input.shopId,
    productId: input.productId,
    skuId: input.skuId,
    delta: released,
    expectedQuantity: input.expectedQuantity,
  });

  await query(
    `UPDATE platform_stock_holds SET status = 'released', released_at = now() WHERE id = $1::bigint`,
    [hold.id],
  );

  return { quantity: result.quantity, released };
}
