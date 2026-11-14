import test from "node:test";
import assert from "node:assert/strict";
import { query } from "@/lib/db";
import { upsertOrders, upsertReturns } from "@/lib/platform/sync";
import { getInTransitQty } from "@/lib/platform/stock";
import { listOpenHolds, openHold, releaseHold } from "@/lib/platform/stock-hold";
import { StockWriteError } from "@/lib/platform/stock-write";
import type { TikTokOrder, TikTokReturn } from "@/lib/platform/tiktok";

const SHOP = "test-shop-holds";
const PLATFORM = "TikTok";
const SKU = "TEST-HOLD-SKU-1";

async function cleanup() {
  await query(`DELETE FROM platform_stock_holds WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_return_items WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_returns WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_order_items WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_orders WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_stock WHERE shop_id = $1`, [SHOP]);
}

function orderWithTwoUnits(): TikTokOrder {
  return {
    id: "order-hold-1",
    status: "COMPLETED",
    createTime: 1_760_000_000,
    paidTime: 1_760_000_000,
    shippedTime: null,
    deliveredTime: null,
    cancelledTime: null,
    cancelReason: null,
    cancelUser: null,
    currency: "THB",
    totalAmount: "200.00",
    trackingNumber: null,
    shippingProvider: null,
    buyerUserId: null,
    recipientName: null,
    recipientPhone: null,
    province: null,
    district: null,
    postalCode: null,
    items: [
      {
        lineItemId: "line-hold-1",
        skuId: SKU,
        productName: SKU,
        skuName: null,
        imageUrl: null,
        quantity: 2,
        salePrice: "100.00",
        currency: "THB",
      },
    ],
    raw: {},
  };
}

function returnInTransit(): TikTokReturn {
  return {
    id: "return-hold-1",
    orderId: "order-hold-1",
    returnType: "RETURN_AND_REFUND",
    status: "BUYER_SHIPPED_ITEM",
    reason: "not_needed",
    reasonText: null,
    trackingNumber: "JTTH000000",
    providerName: "J&T Express",
    refundTotal: "200.00",
    createTime: 1_760_100_000,
    updateTime: 1_760_100_000,
    items: [
      {
        lineItemId: "ret-line-hold-1",
        orderLineItemId: "line-hold-1",
        skuId: SKU,
        sellerSku: SKU,
        productName: SKU,
        quantity: 0,
        refundAmount: "200.00",
      },
    ],
    raw: {},
  };
}

test("holds: จำนวนที่กันมาจากของที่กำลังตีกลับ และไม่ค้างแถวไว้เมื่อเขียนสต็อกไม่สำเร็จ", async () => {
  await cleanup();
  try {
    await query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ($1, $2, $3, $3, 'sku for hold test', 5)`,
      [PLATFORM, SHOP, SKU],
    );
    await upsertOrders(SHOP, [orderWithTwoUnits()]);
    await upsertReturns(SHOP, [returnInTransit()]);

    assert.equal(await getInTransitQty(SHOP, SKU), 2, "ต้องเห็นของที่กำลังตีกลับ 2 ชิ้น");

    // ร้านนี้ไม่ใช่ร้านทดสอบ จึงถูกปฏิเสธก่อนยิง API ใด ๆ
    await assert.rejects(
      () =>
        openHold({
          shopId: SHOP,
          productId: "product-hold-1",
          skuId: SKU,
          expectedQuantity: 5,
          actor: "test",
        }),
      (error: unknown) => error instanceof StockWriteError && error.code === "not_allowed",
    );

    const leftOver = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM platform_stock_holds WHERE shop_id = $1`,
      [SHOP],
    );
    assert.equal(leftOver[0]?.n, "0", "เขียนสต็อกไม่สำเร็จต้องไม่เหลือแถวกันค้างไว้");

    const holds = await listOpenHolds(SHOP);
    assert.equal(holds.size, 0);
  } finally {
    await cleanup();
  }
});

test("holds: ไม่มีของกำลังตีกลับ = กันไม่ได้ และคืนสต็อกโดยไม่มีของที่กันไว้ = ปฏิเสธ", async () => {
  await cleanup();
  try {
    await query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ($1, $2, $3, $3, 'sku for hold test', 5)`,
      [PLATFORM, SHOP, SKU],
    );

    await assert.rejects(
      () =>
        openHold({
          shopId: SHOP,
          productId: "product-hold-1",
          skuId: SKU,
          expectedQuantity: 5,
        }),
      (error: unknown) => error instanceof StockWriteError && error.code === "rejected",
    );

    await assert.rejects(
      () =>
        releaseHold({
          shopId: SHOP,
          productId: "product-hold-1",
          skuId: SKU,
          expectedQuantity: 5,
        }),
      (error: unknown) => error instanceof StockWriteError && error.code === "rejected",
    );
  } finally {
    await cleanup();
  }
});
