import assert from "node:assert/strict";
import test from "node:test";
import { ensureSchema, getPool } from "@/lib/db";
import {
  addCentralStock,
  autoLinkShop,
  centralStockForShop,
  getCentralStockDetail,
  linkListing,
  reconcileCentralStock,
  unlinkListing,
} from "@/lib/stock/central";
import { pushPoolToListings } from "@/lib/stock/push";

// ข้อมูลทดสอบใช้ชื่อเฉพาะของไฟล์นี้ แล้วลบทิ้งท้ายทุกเคส — ไม่แตะของจริง
const SKU = "TEST-CENTRAL-K-01";
const SKU_FB = "TEST-CENTRAL-FB-01";
const SKU_PUSH = "TEST-CENTRAL-PUSH-01";
const SHOP = "test-shop-central";
const SKU_ID = "test-sku-central-1";
const ORDER = "test-order-central-1";
const LINE = "test-line-central-1";

async function cleanup() {
  // ตารางใหม่อยู่ใน DDL ของ ensureSchema — ต้องรันก่อนแตะตาราง (เทสต์ต่อ DB ตรง ไม่ผ่าน query())
  await ensureSchema();
  const pool = getPool();
  await pool.query(`DELETE FROM central_stock_movements WHERE sku_code = ANY($1::text[])`, [[SKU, SKU_FB, SKU_PUSH]]);
  await pool.query(`DELETE FROM central_stock_links WHERE sku_code = ANY($1::text[])`, [[SKU, SKU_FB, SKU_PUSH]]);
  // เคสผูกอัตโนมัติใช้รหัสสินค้าจริง — ล้างด้วยชื่อร้านทดสอบแทนรหัส
  await pool.query(`DELETE FROM central_stock_links WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM central_stock WHERE sku_code = ANY($1::text[])`, [[SKU, SKU_FB, SKU_PUSH]]);
  await pool.query(`DELETE FROM platform_stock WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM platform_order_items WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM platform_orders WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM shipnity_orders WHERE account_key = $1`, [SHOP]);
}

test("central-stock: เติมของเข้าคลังกลางแล้วยอดสะสมถูกต้อง และมีประวัติการเคลื่อนไหว", async () => {
  await cleanup();
  try {
    const first = await addCentralStock({ skuCode: SKU, quantity: 50, note: "รับเข้า", actor: "test" });
    assert.equal(first.onHand, 50);

    const second = await addCentralStock({ skuCode: SKU, quantity: -5, note: "ปรับออก", actor: "test" });
    assert.equal(second.onHand, 45);

    const detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 45);
    assert.equal(detail.movements.length, 2);
    assert.equal(detail.movements[0]?.quantity, -5);
    assert.equal(detail.movements[1]?.quantity, 50);
  } finally {
    await cleanup();
  }
});

test("central-stock: ออเดอร์ TikTok หักยอดกลางครั้งเดียว ซิงก์ซ้ำไม่หักซ้ำ และยกเลิกแล้วคืนยอด", async () => {
  await cleanup();
  const pool = getPool();
  try {
    await addCentralStock({ skuCode: SKU, quantity: 50, actor: "test" });
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 50)`,
      [SHOP, SKU_ID, SKU],
    );
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU, actor: "test" });
    await pool.query(
      `INSERT INTO platform_orders (platform, shop_id, order_id, order_status, create_time)
       VALUES ('TikTok', $1, $2, 'AWAITING_SHIPMENT', now())`,
      [SHOP, ORDER],
    );
    await pool.query(
      `INSERT INTO platform_order_items (platform, shop_id, order_id, line_item_id, sku_id, quantity)
       VALUES ('TikTok', $1, $2, $3, $4, 2)`,
      [SHOP, ORDER, LINE, SKU_ID],
    );

    await reconcileCentralStock({ hours: 1 });
    let detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 48, "ขาย 2 ชิ้น → เหลือ 48");

    // ซิงก์ซ้ำต้องไม่หักเพิ่ม
    await reconcileCentralStock({ hours: 1 });
    detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 48, "เรียกซ้ำแล้วยอดต้องเท่าเดิม");

    // ยกเลิกออเดอร์ → คืนยอดกลับ
    await pool.query(`UPDATE platform_orders SET order_status = 'CANCELLED' WHERE shop_id = $1 AND order_id = $2`, [
      SHOP,
      ORDER,
    ]);
    await reconcileCentralStock({ hours: 1 });
    detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 50, "ยกเลิกแล้วคืนเต็มจำนวน");

    // เลิกผูกแล้วออเดอร์ใหม่ต้องไม่ถูกหัก
    await pool.query(`UPDATE platform_orders SET order_status = 'AWAITING_SHIPMENT' WHERE shop_id = $1 AND order_id = $2`, [
      SHOP,
      ORDER,
    ]);
    await reconcileCentralStock({ hours: 1 });
    detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 48);

    await unlinkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID });
    await pool.query(`UPDATE platform_order_items SET quantity = 5 WHERE shop_id = $1 AND order_id = $2`, [SHOP, ORDER]);
    await reconcileCentralStock({ hours: 1 });
    detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 48, "เลิกผูกแล้วเปลี่ยนจำนวนออเดอร์ก็ไม่กระทบยอดกลาง");
  } finally {
    await cleanup();
  }
});

test("central-stock: ออเดอร์ Facebook จาก Shipnity หักยอดกลาง และยกเลิกแล้วคืนยอด", async () => {
  await cleanup();
  const pool = getPool();
  try {
    await addCentralStock({ skuCode: SKU_FB, quantity: 10, actor: "test" });
    await pool.query(
      `INSERT INTO shipnity_orders (account_key, order_id, created_at, content_hash, payload)
       VALUES ($1, 9001, now(), 'test', $2::jsonb)`,
      [
        SHOP,
        JSON.stringify({
          id: 9001,
          contact_method: "facebook",
          cancelled: false,
          purchases: [{ code: SKU_FB, quantity: 3 }],
        }),
      ],
    );

    await reconcileCentralStock({ hours: 1 });
    let detail = await getCentralStockDetail(SKU_FB);
    assert.equal(detail.summary?.onHand, 7, "ขาย 3 ชิ้น → เหลือ 7");

    await pool.query(`UPDATE shipnity_orders SET payload = jsonb_set(payload, '{cancelled}', 'true') WHERE account_key = $1`, [
      SHOP,
    ]);
    await reconcileCentralStock({ hours: 1 });
    detail = await getCentralStockDetail(SKU_FB);
    assert.equal(detail.summary?.onHand, 10, "ยกเลิกแล้วคืนเต็มจำนวน");
  } finally {
    await cleanup();
  }
});

test("central-stock: ผูกรหัสอัตโนมัติเมื่อรหัสบนประกาศตรงกับรายการสินค้า และอ่านยอดตามร้านได้", async () => {
  await cleanup();
  const pool = getPool();
  try {
    // รหัสกลางที่มีอยู่จริงในรายการสินค้า (ไม่ต้องมีสินค้าจริงก็ผูกได้)
    const existing = await pool.query<{ sku_code: string }>(`SELECT sku_code FROM products LIMIT 1`);
    const code = existing.rows[0]?.sku_code;
    assert.ok(code, "ต้องมีรายการสินค้าในฐานข้อมูลอย่างน้อย 1 รายการ");

    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 4)`,
      [SHOP, SKU_ID, code],
    );
    const linked = await autoLinkShop("TikTok", SHOP);
    assert.equal(linked, 1);

    const perShop = await centralStockForShop("TikTok", SHOP);
    assert.equal(perShop.get(SKU_ID)?.skuCode, code);
  } finally {
    await cleanup();
  }
});

test("central-stock: ผูกแล้วได้รหัสกลางทันทีโดยตั้งต้นจากยอดบนประกาศ และไม่เขียนประกาศซ้ำเมื่อยอดตรงกัน", async () => {
  await cleanup();
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 5)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU_PUSH, actor: "test" });

    // ผูกแล้วต้องมีแถวในคลังกลางเลย ไม่ใช่รอเติมของก่อน — ตั้งต้นเท่ายอดบนประกาศ
    const detail = await getCentralStockDetail(SKU_PUSH);
    assert.equal(detail.summary?.onHand, 5, "ตั้งต้นด้วยยอดที่ประกาศมีอยู่ ไม่ใช่ 0");
    assert.equal(detail.movements[0]?.kind, "open");
    assert.equal(detail.links.length, 1);

    // ผูกซ้ำต้องไม่บวกยอดซ้ำ
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU_PUSH, actor: "test" });
    const again = await getCentralStockDetail(SKU_PUSH);
    assert.equal(again.summary?.onHand, 5, "ผูกซ้ำแล้วยอดต้องเท่าเดิม");
    assert.equal(again.movements.length, 1, "ต้องไม่เกิดประวัติซ้ำ");

    // ยอดตรงกับประกาศอยู่แล้ว → ต้องข้าม ไม่ยิง API
    const same = await pushPoolToListings({ skuCodes: [SKU_PUSH] });
    assert.equal(same.pushed, 0);
    assert.equal(same.skipped, 1, "ยอดตรงกันแล้วต้องข้าม ไม่เขียนซ้ำ");

    const untouched = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE platform = 'TikTok' AND shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID],
    );
    assert.equal(untouched.rows[0]?.quantity, 5, "ยอดบนประกาศต้องเท่าเดิม");
  } finally {
    await cleanup();
  }
});

test("central-stock: ขายรหัสที่ยังไม่เคยเติมของ ต้องไม่สร้างยอดกลางและไม่เขียนทับประกาศ (เคส 19 พ.ย. 69)", async () => {
  await cleanup();
  const pool = getPool();
  try {
    // สภาพเดียวกับตอนกดผูกอัตโนมัติ: มีประกาศบนร้าน + มีลิงก์ แต่คลังกลางยังไม่มีของ
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 40)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    await pool.query(
      `INSERT INTO central_stock_links (platform, shop_id, sku_id, sku_code, linked_by)
       VALUES ('TikTok', $1, $2, $3, 'auto')`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    await pool.query(
      `INSERT INTO platform_orders (platform, shop_id, order_id, order_status, create_time)
       VALUES ('TikTok', $1, $2, 'AWAITING_SHIPMENT', now())`,
      [SHOP, ORDER],
    );
    await pool.query(
      `INSERT INTO platform_order_items (platform, shop_id, order_id, line_item_id, sku_id, quantity)
       VALUES ('TikTok', $1, $2, $3, $4, 3)`,
      [SHOP, ORDER, LINE, SKU_ID],
    );

    await reconcileCentralStock({ hours: 1 });
    const created = await pool.query(`SELECT on_hand FROM central_stock WHERE sku_code = $1`, [SKU_PUSH]);
    assert.equal(created.rowCount, 0, "การขายต้องไม่สร้างแถวในคลังกลางเอง");

    const noWrite = await pushPoolToListings({ skuCodes: [SKU_PUSH] });
    assert.equal(noWrite.pushed + noWrite.skipped + noWrite.failed, 0, "รหัสที่ยังไม่เคยเติมของต้องไม่ถูกเลือกเป็นเป้าหมายเลย");
    const listing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID],
    );
    assert.equal(Number(listing.rows[0]?.quantity), 40, "ยอดบนประกาศต้องไม่ถูกแตะ");

    // เติมของเข้าคลังกลางจริงแล้วจึงถูกเลือกเป็นเป้าหมายให้เขียน (ร้านทดสอบไม่มีการเชื่อมต่อ TikTok จริง จึงนับเป็น failed ไม่ใช่ pushed)
    await addCentralStock({ skuCode: SKU_PUSH, quantity: 12, actor: "test" });
    const wrote = await pushPoolToListings({ skuCodes: [SKU_PUSH] });
    assert.ok(wrote.pushed + wrote.skipped + wrote.failed >= 1, "เติมของแล้วต้องถูกเลือกเป็นเป้าหมาย");
  } finally {
    await cleanup();
  }
});
