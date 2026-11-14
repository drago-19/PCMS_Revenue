import test from "node:test";
import assert from "node:assert/strict";
import { query } from "@/lib/db";
import { upsertOrders, upsertReturns } from "@/lib/platform/sync";
import { getStockCounts, getStockPage } from "@/lib/platform/stock";
import type { TikTokOrder, TikTokReturn } from "@/lib/platform/tiktok";

// ร้านสมมติสำหรับเทสต์เท่านั้น — ลบทุกครั้งก่อนและหลังรัน
const SHOP = "test-shop-returns";
const PLATFORM = "TikTok";
const SKU_SENT_BACK = "TEST-RET-SKU-SENT";
const SKU_KEEPS_ITEM = "TEST-RET-SKU-KEEP";

async function cleanup() {
  await query(`DELETE FROM platform_return_items WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_returns WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_order_items WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_orders WHERE shop_id = $1`, [SHOP]);
  await query(`DELETE FROM platform_stock WHERE shop_id = $1`, [SHOP]);
}

function makeOrder(id: string, lines: Array<{ lineItemId: string; skuId: string; quantity: number }>): TikTokOrder {
  return {
    id,
    status: "COMPLETED",
    createTime: 1_760_000_000,
    paidTime: 1_760_000_000,
    shippedTime: null,
    deliveredTime: null,
    cancelledTime: null,
    cancelReason: null,
    cancelUser: null,
    currency: "THB",
    totalAmount: "100.00",
    trackingNumber: null,
    shippingProvider: null,
    buyerUserId: null,
    recipientName: null,
    recipientPhone: null,
    province: null,
    district: null,
    postalCode: null,
    items: lines.map((line) => ({
      lineItemId: line.lineItemId,
      skuId: line.skuId,
      productName: line.skuId,
      skuName: null,
      imageUrl: null,
      quantity: line.quantity,
      salePrice: "50.00",
      currency: "THB",
    })),
    raw: {},
  };
}

function makeReturn(overrides: Partial<TikTokReturn> & Pick<TikTokReturn, "id" | "orderId">): TikTokReturn {
  return {
    returnType: "RETURN_AND_REFUND",
    status: "BUYER_SHIPPED_ITEM",
    reason: "not_needed",
    reasonText: null,
    trackingNumber: null,
    providerName: null,
    refundTotal: null,
    createTime: 1_760_100_000,
    updateTime: 1_760_100_000,
    items: [],
    raw: {},
    ...overrides,
  };
}

test("returns: นับเฉพาะของที่ลูกค้าส่งคืนจริง และใช้จำนวนจากรายการออเดอร์เมื่อ API ไม่ส่งจำนวนมา", async () => {
  await cleanup();
  try {
    await query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ($1, $2, $3, $3, 'sku sent back', 10), ($1, $2, $4, $4, 'sku keeps item', 10)`,
      [PLATFORM, SHOP, SKU_SENT_BACK, SKU_KEEPS_ITEM],
    );

    await upsertOrders(SHOP, [
      makeOrder("order-1", [
        { lineItemId: "line-1", skuId: SKU_SENT_BACK, quantity: 2 },
        { lineItemId: "line-2", skuId: SKU_KEEPS_ITEM, quantity: 1 },
      ]),
    ]);

    await upsertReturns(SHOP, [
      // ของเดินกลับจริง — จำนวนในแถวคืนเป็น 0 จึงต้องถอยไปใช้จำนวนในรายการออเดอร์ (2)
      makeReturn({
        id: "return-1",
        orderId: "order-1",
        items: [
          {
            lineItemId: "ret-line-1",
            orderLineItemId: "line-1",
            skuId: SKU_SENT_BACK,
            sellerSku: SKU_SENT_BACK,
            productName: "sku sent back",
            quantity: 0,
            refundAmount: "100.00",
          },
        ],
      }),
      // คืนเงินอย่างเดียว ลูกค้าเก็บของ — ไม่ใช่ของเดินกลับ จึงต้องไม่ถูกนับ
      makeReturn({
        id: "return-2",
        orderId: "order-1",
        returnType: "REFUND",
        status: "RETURN_OR_REFUND_REQUEST_COMPLETE",
        items: [
          {
            lineItemId: "ret-line-2",
            orderLineItemId: "line-2",
            skuId: SKU_KEEPS_ITEM,
            sellerSku: SKU_KEEPS_ITEM,
            productName: "sku keeps item",
            quantity: 1,
            refundAmount: "50.00",
          },
        ],
      }),
      // อนุมัติให้คืนแล้วแต่ลูกค้ายังไม่ส่งของ — ยังไม่นับ
      makeReturn({ id: "return-3", orderId: "order-1", status: "AWAITING_BUYER_SHIP" }),
    ]);

    const page = await getStockPage(SHOP, { pageSize: 50 });
    const sentBack = page.rows.find((row) => row.skuId === SKU_SENT_BACK);
    const keepsItem = page.rows.find((row) => row.skuId === SKU_KEEPS_ITEM);
    assert.equal(sentBack?.inTransit, 2, "ของที่ส่งคืนแล้วต้องถูกนับ 2 ชิ้น (ใช้จำนวนจากรายการออเดอร์)");
    assert.equal(keepsItem?.inTransit, 0, "คืนเงินอย่างเดียวต้องไม่ถูกนับเป็นของกำลังเดินกลับ");

    const counts = await getStockCounts(SHOP);
    assert.equal(counts.inTransit, 2);
    assert.equal(counts.quantity, 20, "ยอดคงเหลือบน TikTok ยังเป็นค่าที่ดึงมา ไม่ถูกหักในชั้นนี้");
  } finally {
    await cleanup();
  }
});

test("returns: ซิงก์ซ้ำแล้วยอดไม่บวกซ้ำ และสถานะที่ปิดแล้วต้องหลุดออกจากยอดกำลังตีกลับ", async () => {
  await cleanup();
  try {
    await query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ($1, $2, $3, $3, 'sku sent back', 10)`,
      [PLATFORM, SHOP, SKU_SENT_BACK],
    );
    await upsertOrders(SHOP, [
      makeOrder("order-2", [{ lineItemId: "line-9", skuId: SKU_SENT_BACK, quantity: 1 }]),
    ]);

    const base = makeReturn({
      id: "return-9",
      orderId: "order-2",
      items: [
        {
          lineItemId: "ret-line-9",
          orderLineItemId: "line-9",
          skuId: SKU_SENT_BACK,
          sellerSku: SKU_SENT_BACK,
          productName: "sku sent back",
          quantity: 1,
          refundAmount: "50.00",
        },
      ],
    });

    await upsertReturns(SHOP, [base]);
    await upsertReturns(SHOP, [base]);
    const afterTwice = await getStockCounts(SHOP);
    assert.equal(afterTwice.inTransit, 1, "บันทึกซ้ำต้องไม่ทำให้ยอดเพิ่ม");

    await upsertReturns(SHOP, [{ ...base, status: "REFUND_OR_RETURN_REQUEST_REJECT" }]);
    const afterClose = await getStockCounts(SHOP);
    assert.equal(afterClose.inTransit, 0, "คำขอที่ถูกปฏิเสธต้องหลุดออกจากยอดกำลังตีกลับ");

    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM platform_returns WHERE shop_id = $1 AND return_id = $2`,
      [SHOP, "return-9"],
    );
    assert.equal(rows[0]?.n, "1", "หนึ่งคำขอคืนต้องมีแถวเดียว");
  } finally {
    await cleanup();
  }
});
