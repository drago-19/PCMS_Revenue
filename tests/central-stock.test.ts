import assert from "node:assert/strict";
import test from "node:test";
import { ensureSchema, getPool } from "@/lib/db";
import {
  addCentralStock,
  centralStockForShop,
  createCentralStockFromListing,
  getCentralStockDetail,
  linkListing,
  readListingForCentralLink,
  reconcileCentralStock,
  unlinkListing,
} from "@/lib/stock/central";
import { pushPoolToListings } from "@/lib/stock/push";

// ข้อมูลทดสอบใช้ชื่อเฉพาะของไฟล์นี้ แล้วลบทิ้งท้ายทุกเคส — ไม่แตะของจริง
const SKU = "TEST-CENTRAL-K-01";
const SKU_FB = "TEST-CENTRAL-FB-01";
const SKU_PUSH = "TEST-CENTRAL-PUSH-01";
const SKU_BACK = "TEST-CENTRAL-BACK-01";
const SHOP = "test-shop-central";
const SKU_ID = "test-sku-central-1";
const SKU_ID_BACK = "test-sku-central-back-1";
const ORDER = "test-order-central-1";
const LINE = "test-line-central-1";
const ORDER_BACK = "test-order-central-back-1";
const LINE_BACK = "test-line-central-back-1";
const CODES = [SKU, SKU_FB, SKU_PUSH, SKU_BACK];

async function cleanup() {
  // ตารางใหม่อยู่ใน DDL ของ ensureSchema — ต้องรันก่อนแตะตาราง (เทสต์ต่อ DB ตรง ไม่ผ่าน query())
  await ensureSchema();
  const pool = getPool();
  await pool.query(`DELETE FROM central_stock_movements WHERE sku_code = ANY($1::text[])`, [CODES]);
  await pool.query(`DELETE FROM central_stock_links WHERE sku_code = ANY($1::text[])`, [CODES]);
  // เคสผูกอัตโนมัติใช้รหัสสินค้าจริง — ล้างด้วยชื่อร้านทดสอบแทนรหัส
  await pool.query(`DELETE FROM central_stock_links WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM central_stock WHERE sku_code = ANY($1::text[])`, [CODES]);
  // ร้านที่ใช้ในเทสต์เป็นของไฟล์นี้เท่านั้น (ชื่อร้านตัดสินด่าน STOCK_PUSH_LIVE)
  await pool.query(`DELETE FROM platform_accounts WHERE platform = 'TikTok' AND account_key = $1`, [SHOP]);
  await pool.query(`DELETE FROM platform_stock WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM platform_order_items WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM platform_orders WHERE shop_id = $1`, [SHOP]);
  await pool.query(`DELETE FROM shipnity_orders WHERE account_key = $1`, [SHOP]);
}

/**
 * สร้างร้านของเทสต์ — ชื่อร้านเป็นตัวตัดสินด่าน STOCK_PUSH_LIVE (SANDBOX_ = ร้านทดสอบ)
 * ไม่ใส่ token จริง เคสที่ผ่านด่านจึงไม่มีการยิงคำขอออกไปนอกเครื่อง
 */
async function upsertTestShop(shopName: string) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_accounts (platform, account_key, shop_name, status)
     VALUES ('TikTok', $1, $2, 'connected')
     ON CONFLICT (platform, account_key) DO UPDATE SET shop_name = EXCLUDED.shop_name`,
    [SHOP, shopName],
  );
}

/** คืนค่าธง env เดิมหลังจบเคส — เทสต์ห้ามทิ้งค่าค้างให้เคสถัดไป */
function restoreEnv(name: "STOCK_PUSH_ENABLED" | "STOCK_PUSH_LIVE", previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
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

    // เทสต์นี้ตรวจ "กติกาการเลือกเป้าหมาย" ของตัวเขียนยอด — ค่าเริ่มต้นของระบบคือเปิดดันยอด
    const previousFlag = process.env.STOCK_PUSH_ENABLED;
    delete process.env.STOCK_PUSH_ENABLED;
    let noWrite: Awaited<ReturnType<typeof pushPoolToListings>>;
    try {
      noWrite = await pushPoolToListings({ skuCodes: [SKU_PUSH] });
    } finally {
      if (previousFlag === undefined) delete process.env.STOCK_PUSH_ENABLED;
      else process.env.STOCK_PUSH_ENABLED = previousFlag;
    }
    assert.equal(noWrite.disabled, false, "ค่าเริ่มต้นต้องเดินเข้าทางเขียนยอดจริง");
    assert.equal(
      noWrite.pushed + noWrite.skipped + noWrite.failed,
      0,
      "รหัสที่ยังไม่เคยมีของเข้าต้องไม่ถูกเลือกเป็นเป้าหมายเลย",
    );
    const listing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID],
    );
    assert.equal(Number(listing.rows[0]?.quantity), 40, "ยอดบนประกาศต้องไม่ถูกแตะ");
  } finally {
    await cleanup();
  }
});

test("central-stock: ผูกร้านที่สองเข้าจำนวนเดียวกัน ยึดยอดน้อยสุดของประกาศ ไม่ดันยอดขึ้น", async () => {
  await cleanup();
  const pool = getPool();
  const skuIdSecond = "test-sku-central-2";
  try {
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 5)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU_PUSH, actor: "test" });
    let detail = await getCentralStockDetail(SKU_PUSH);
    assert.equal(detail.summary?.onHand, 5, "ตั้งต้นจากยอดบนประกาศ");

    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, quantity)
       VALUES ('TikTok', $1, $2, $3, 3)`,
      [SHOP, skuIdSecond, SKU_PUSH],
    );
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: skuIdSecond, skuCode: SKU_PUSH, actor: "test" });
    detail = await getCentralStockDetail(SKU_PUSH);
    assert.equal(detail.summary?.onHand, 3, "ยึดยอดน้อยสุดระหว่างคลังกลางกับประกาศ");
    assert.equal(detail.movements[0]?.quantity, -2, "บันทึกส่วนต่างที่ลดลง");

    await pool.query(`UPDATE platform_stock SET quantity = 50 WHERE shop_id = $1 AND sku_id = $2`, [SHOP, skuIdSecond]);
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: skuIdSecond, skuCode: SKU_PUSH, actor: "test" });
    detail = await getCentralStockDetail(SKU_PUSH);
    assert.equal(detail.summary?.onHand, 3, "ผูกซ้ำด้วยยอดมากกว่าต้องไม่ดันยอดขึ้น");
  } finally {
    await cleanup();
  }
});

test("central-stock: ค่าเริ่มต้นเปิดดันยอด แต่ร้านจริงยังไม่ถูกเขียนจนกว่าจะมี STOCK_PUSH_LIVE", async () => {
  await cleanup();
  const pool = getPool();
  const previousFlag = process.env.STOCK_PUSH_ENABLED;
  const previousLive = process.env.STOCK_PUSH_LIVE;
  delete process.env.STOCK_PUSH_ENABLED;
  delete process.env.STOCK_PUSH_LIVE;
  try {
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_id, quantity)
       VALUES ('TikTok', $1, $2, $3, 'test-product-central', 5)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    // ผูกแล้วเกิดประวัติ 'open' = เคยมีของเข้าคลังกลาง → เป็นเป้าหมายที่ตัวเขียนยอดจะเลือกเขียน
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU_PUSH, actor: "test" });
    // ร้านจริง (ไม่ใช่ SANDBOX_) — ต้องไม่ถูกเขียนเมื่อยังไม่ตั้ง STOCK_PUSH_LIVE
    await upsertTestShop("Kissi Studio");
    // ดันยอดบนประกาศให้ไม่ตรงกับยอดกลาง (5) — ถ้าเขียนได้จริง ระบบจะเขียนกลับเป็น 5
    await pool.query(`UPDATE platform_stock SET quantity = 99 WHERE shop_id = $1 AND sku_id = $2`, [SHOP, SKU_ID]);

    const result = await pushPoolToListings({ skuCodes: [SKU_PUSH] });
    assert.equal(result.disabled, false, "ค่าเริ่มต้นต้องเปิดดันยอด — สต็อกกลางเป็นเจ้าของยอด");
    assert.equal(result.blocked, 1, "ร้านจริงต้องถูกกันไว้เมื่อยังไม่ตั้ง STOCK_PUSH_LIVE");
    assert.equal(result.pushed, 0, "ต้องไม่เขียนยอดลงประกาศของร้านจริง");
    assert.equal(result.failed, 0, "การกันร้านจริงไม่ใช่ความล้มเหลว");
    assert.equal(result.errors.length, 0);

    const listing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID],
    );
    assert.equal(Number(listing.rows[0]?.quantity), 99, "ยอดบนประกาศของร้านจริงต้องไม่ถูกเขียนทับ");
  } finally {
    restoreEnv("STOCK_PUSH_ENABLED", previousFlag);
    restoreEnv("STOCK_PUSH_LIVE", previousLive);
    await cleanup();
  }
});

test("central-stock: เติมด้วยมือแล้วดันขึ้นประกาศทันที — คืนผลว่ารหัสไหน ใช้เวลาเท่าไร", async () => {
  await cleanup();
  const pool = getPool();
  const previousLive = process.env.STOCK_PUSH_LIVE;
  delete process.env.STOCK_PUSH_LIVE;
  try {
    // ร้านทดสอบ (SANDBOX_) ผ่านด่านร้านจริงได้เสมอ แต่ร้านจำลองนี้ไม่มี token จริง
    // จึงเดินเข้าเส้นทางเขียนยอดครบแล้วล้มที่ขั้นขอ token — ไม่มีการยิงคำขอออกไปนอกเครื่อง
    await upsertTestShop("SANDBOX_TEST_CENTRAL");
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_id, quantity)
       VALUES ('TikTok', $1, $2, $3, 'test-product-central', 5)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID, skuCode: SKU_PUSH, actor: "test" });

    const received = await addCentralStock({ skuCode: SKU_PUSH, quantity: 2, note: "เติมทดสอบ", actor: "test" });
    assert.equal(received.onHand, 7, "ยอดกลางต้องบวกตามที่เติม");
    assert.deepEqual(received.push.codes, [SKU_PUSH], "ต้องดันยอดของรหัสที่เพิ่งเติมกลับไปที่ตัวเขียนยอด");
    assert.equal(received.push.disabled, false, "ค่าเริ่มต้นต้องเปิดดันยอด");
    assert.equal(typeof received.push.ms, "number");
    assert.ok(received.push.ms >= 0, "ต้องรายงานเวลาที่ใช้ดันยอดเป็นตัวเลข");
    assert.equal(received.push.blocked, 0, "ร้านทดสอบต้องไม่ถูกกันด้วยธงร้านจริง");
    assert.equal(received.push.failed, 1, "ร้านจำลองไม่มี token — ตัวเขียนยอดต้องรายงานว่าพลาด ไม่ใช่เงียบ");
    assert.equal(received.push.errors.length, 1);

    const listing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID],
    );
    assert.equal(Number(listing.rows[0]?.quantity), 5, "เขียนไม่สำเร็จแล้วยอดบนประกาศต้องเท่าเดิม");
  } finally {
    restoreEnv("STOCK_PUSH_LIVE", previousLive);
    await cleanup();
  }
});

test("central-stock: ขายแล้วยอดกลางลด ระบบเลือกดันยอดกลับขึ้นประกาศ (ร้านจริงรอธง)", async () => {
  await cleanup();
  const pool = getPool();
  const previousLive = process.env.STOCK_PUSH_LIVE;
  delete process.env.STOCK_PUSH_LIVE;
  try {
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_id, quantity)
       VALUES ('TikTok', $1, $2, $3, 'test-product-central', 50)`,
      [SHOP, SKU_ID_BACK, SKU_BACK],
    );
    await addCentralStock({ skuCode: SKU_BACK, quantity: 50, actor: "test" });
    await linkListing({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID_BACK, skuCode: SKU_BACK, actor: "test" });
    await upsertTestShop("Kissi Studio");
    await pool.query(
      `INSERT INTO platform_orders (platform, shop_id, order_id, order_status, create_time)
       VALUES ('TikTok', $1, $2, 'AWAITING_SHIPMENT', now())`,
      [SHOP, ORDER_BACK],
    );
    await pool.query(
      `INSERT INTO platform_order_items (platform, shop_id, order_id, line_item_id, sku_id, quantity)
       VALUES ('TikTok', $1, $2, $3, $4, 2)`,
      [SHOP, ORDER_BACK, LINE_BACK, SKU_ID_BACK],
    );

    await reconcileCentralStock({ hours: 1 });
    const detail = await getCentralStockDetail(SKU_BACK);
    assert.equal(detail.summary?.onHand, 48, "ขาย 2 ชิ้น → ยอดกลางเหลือ 48");

    // หลังหักยอดจากการขาย ตัวเรียก (webhook/scheduler) ดันยอดกลับทุกร้าน — รหัสนี้ต้องถูกเลือก
    const pushBack = await pushPoolToListings({ skuCodes: [SKU_BACK] });
    assert.equal(pushBack.disabled, false);
    assert.equal(pushBack.skipped, 0, "ยอดกลาง 48 ไม่ตรงกับประกาศ 50 → ต้องไม่ถูกข้าม");
    assert.equal(pushBack.blocked, 1, "ระบบเลือกดันยอดกลับแล้ว แต่ร้านจริงรอธง STOCK_PUSH_LIVE");

    const listing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM platform_stock WHERE shop_id = $1 AND sku_id = $2`,
      [SHOP, SKU_ID_BACK],
    );
    assert.equal(Number(listing.rows[0]?.quantity), 50, "ร้านจริงยังไม่ถูกเขียน — ยอดบนประกาศเท่าเดิม");
  } finally {
    restoreEnv("STOCK_PUSH_LIVE", previousLive);
    await cleanup();
  }
});

test("central-stock: สร้างรหัสกลางใหม่จากประกาศแล้วผูกให้เลย — ยอดเริ่มต้นเท่ายอดบนประกาศ", async () => {
  await cleanup();
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ('TikTok', $1, $2, $3, 'สินค้าทดสอบสร้างรหัสใหม่', 7)`,
      [SHOP, SKU_ID, SKU_PUSH],
    );

    const listing = await readListingForCentralLink({ platform: "TikTok", shopId: SHOP, skuId: SKU_ID });
    assert.equal(listing?.quantity, 7, "ต้องอ่านยอดบนประกาศได้");
    assert.equal(listing?.productName, "สินค้าทดสอบสร้างรหัสใหม่");

    const made = await createCentralStockFromListing({
      platform: "TikTok",
      shopId: SHOP,
      skuId: SKU_ID,
      skuCode: `  ${SKU_PUSH}  `,
      actor: "test",
    });
    assert.equal(made.created, true, "รหัสใหม่ต้องถูกสร้าง");
    assert.equal(made.skuCode, SKU_PUSH, "รหัสต้องถูก normalize");
    assert.equal(made.onHand, 7, "ยอดเริ่มต้นต้องมาจากยอดบนประกาศ");

    const detail = await getCentralStockDetail(SKU_PUSH);
    assert.equal(detail.summary?.onHand, 7);
    assert.equal(detail.summary?.productName, "สินค้าทดสอบสร้างรหัสใหม่", "ชื่อมาจากประกาศ");
    assert.equal(detail.movements[0]?.kind, "open", "ประวัติการตั้งต้นต้องเป็น open");
    assert.equal(detail.movements[0]?.source, "link");
    assert.equal(detail.links.length, 1, "ต้องผูกให้ประกาศนี้ทันที");
    assert.equal(detail.links[0]?.skuId, SKU_ID);
  } finally {
    await cleanup();
  }
});

test("central-stock: สร้างรหัสใหม่ที่รหัสมีอยู่แล้ว ต้องไม่เขียนทับยอดเดิมและไม่ผูกทับ", async () => {
  await cleanup();
  const pool = getPool();
  try {
    await addCentralStock({ skuCode: SKU, quantity: 20, note: "ของเดิม", actor: "test" });
    await pool.query(
      `INSERT INTO platform_stock (platform, shop_id, sku_id, seller_sku, product_name, quantity)
       VALUES ('TikTok', $1, $2, $3, 'สินค้าทดสอบรหัสซ้ำ', 7)`,
      [SHOP, SKU_ID, SKU],
    );

    const made = await createCentralStockFromListing({
      platform: "TikTok",
      shopId: SHOP,
      skuId: SKU_ID,
      skuCode: SKU,
      actor: "test",
    });
    assert.equal(made.created, false, "รหัสที่มีอยู่แล้วต้องไม่ถูกสร้างซ้ำ");

    const detail = await getCentralStockDetail(SKU);
    assert.equal(detail.summary?.onHand, 20, "ยอดเดิมต้องไม่ถูกเขียนทับ");
    assert.equal(detail.movements.length, 1, "ต้องไม่เกิดประวัติใหม่");
    assert.equal(detail.links.length, 0, "ต้องไม่ผูกประกาศเข้าของเดิมเอง");
  } finally {
    await cleanup();
  }
});
