import test from "node:test";
import assert from "node:assert/strict";
import {
  availableOf,
  groupCentralStockRows,
  mergePrice,
  onHandTotalOf,
  type CentralListSkuInput,
} from "@/lib/stock/central-list";

/**
 * ตาราง "รายการในคลังกลาง" ต้องเห็นเป็น "สินค้า 1 แถวหลัก + รหัสกลาง (ไซส์) เป็นแถวลูก"
 * ไฟล์นี้ทดสอบเฉพาะฟังก์ชันล้วน (ไม่ต่อฐานข้อมูล)
 */

function row(overrides: Partial<CentralListSkuInput> & { skuCode: string }): CentralListSkuInput {
  return {
    productName: null,
    onHand: 0,
    reserved: 0,
    listingCount: 0,
    shopCount: 0,
    imageUrl: null,
    hasImage: false,
    updatedAt: "2026-11-20T06:00:00.000Z",
    productId: null,
    variantName: null,
    price: null,
    currency: "THB",
    ...overrides,
  };
}

test("central stock list: จัดกลุ่มตาม product_id ของประกาศ และรวมยอดไว้ที่แถวหลัก", () => {
  const groups = groupCentralStockRows([
    row({
      skuCode: "K-5ORS-16-F",
      productName: "เสื้อ Oversize",
      productId: "prod-5ors",
      variantName: "Free size",
      price: { min: 199, max: 199 },
      onHand: 12,
      reserved: 2,
      listingCount: 1,
      shopCount: 1,
      imageUrl: "https://example.test/a.jpg",
    }),
    row({
      skuCode: "K-5ORS-16-M",
      productName: "เสื้อ Oversize",
      productId: "prod-5ors",
      variantName: "M",
      price: { min: 219, max: 219 },
      onHand: 5,
      reserved: 3,
      listingCount: 2,
      shopCount: 2,
    }),
    row({
      skuCode: "K-14PLS-2",
      productName: "กางเกง",
      productId: "prod-14pls",
      onHand: 125,
      price: { min: 350, max: 350 },
      listingCount: 1,
      shopCount: 1,
    }),
  ]);

  assert.equal(groups.length, 2);
  const first = groups[0];
  assert.equal(first.key, "product:prod-5ors");
  assert.equal(first.productId, "prod-5ors");
  assert.equal(first.productName, "เสื้อ Oversize");
  // ค่าที่ขาดหายของกลุ่มเติมจากรหัสลำดับถัดไป
  assert.equal(first.imageUrl, "https://example.test/a.jpg");
  assert.equal(first.skuCount, 2);
  assert.deepEqual(
    first.skus.map((sku) => sku.skuCode),
    ["K-5ORS-16-F", "K-5ORS-16-M"],
  );
  assert.equal(first.totalAvailable, 17);
  assert.equal(first.totalReserved, 5);
  assert.equal(first.totalOnHand, 22);
  assert.equal(first.listingCount, 3);
  assert.equal(first.shopCount, 2);
});

test("central stock list: รหัสที่ยังไม่ผูกประกาศเป็นกลุ่มของตัวเอง ไม่ถูกรวมเข้าด้วยกัน", () => {
  const groups = groupCentralStockRows([
    row({ skuCode: "FREE-01", onHand: 4 }),
    row({ skuCode: "FREE-02", onHand: 7 }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["sku:FREE-01", "sku:FREE-02"],
  );
  assert.equal(groups[0].productId, null);
  assert.equal(groups[0].skuCount, 1);
  // ยังไม่มีชื่อไซส์จากประกาศ และท้ายรหัส (01) ไม่ใช่ไซส์ → "—" พร้อมบอกว่าไม่มีตัวเลือก
  // (กติกาเดียวกับ variantLabel: ห้ามเดาว่าเลขท้ายรหัสคือไซส์)
  assert.equal(groups[0].skus[0].variantText, "—");
  assert.equal(groups[0].skus[0].variantHint, "สินค้านี้ไม่มีตัวเลือก");
});

test("central stock list: ป้ายไซส์ครบสามกรณี (ชื่อจากประกาศ · ไม่มีชื่อใช้ท้ายรหัส · รหัสไม่มีขีด)", () => {
  const groups = groupCentralStockRows([
    row({ skuCode: "K-5ORS-16-F", productId: "p-1", variantName: "Free size", onHand: 1 }),
    row({ skuCode: "K-5ORS-16-M", productId: "p-1", variantName: null, onHand: 1 }),
    row({ skuCode: "K-5ORS-16-XL", productId: "p-1", variantName: " ", onHand: 1 }),
    row({ skuCode: "K-14PLS-2", productId: "p-2", variantName: "", onHand: 1 }),
    row({ skuCode: "NOSIZE01", productId: "p-3", onHand: 1 }),
  ]);

  const labelled = groups.flatMap((group) => group.skus.map((sku) => [sku.skuCode, sku.variantText]));
  assert.deepEqual(labelled, [
    ["K-5ORS-16-F", "Free size"],
    // ไม่มีชื่อไซส์จากประกาศ → ใช้ท้ายรหัสเป็นป้ายชั่วคราวเฉพาะเมื่อท้ายนั้นเป็นไซส์ที่รู้จัก
    ["K-5ORS-16-M", "ไซส์ M"],
    ["K-5ORS-16-XL", "ไซส์ XL"],
    // K-14PLS-2 ท้ายรหัสเป็นเลข 2 ซึ่งไม่ใช่ไซส์ → ห้ามเดา
    ["K-14PLS-2", "—"],
    ["NOSIZE01", "—"],
  ]);

  const hints = groups.flatMap((group) => group.skus.map((sku) => sku.variantHint));
  assert.deepEqual(hints, [
    null,
    "ชื่อไซส์จริงจะขึ้นหลังซิงก์รอบถัดไป",
    "ชื่อไซส์จริงจะขึ้นหลังซิงก์รอบถัดไป",
    "สินค้านี้ไม่มีตัวเลือก",
    "สินค้านี้ไม่มีตัวเลือก",
  ]);
});

test("central stock list: คงเหลือ (ขายได้) = on_hand ตรง ๆ ไม่ลบจองซ้ำ — หักสองรอบไม่ได้", () => {
  // เคสจริง 19 พ.ย. 69: ยอดกลางถูกหักตอนขายแล้ว จึงเหลือ 48 แต่ยังมีของค้างส่ง 190
  const groups = groupCentralStockRows([
    row({ skuCode: "K-6TL-134", productId: "prod-6tl", onHand: 48, reserved: 190 }),
  ]);

  assert.equal(availableOf({ onHand: 48 }), 48);
  assert.equal(onHandTotalOf({ onHand: 48, reserved: 190 }), 238);
  const sku = groups[0].skus[0];
  assert.equal(sku.available, 48, "ถ้าลบจองซ้ำจะได้ −142 ซึ่งไม่มีอยู่จริง");
  assert.equal(sku.onHandTotal, 238);
  assert.equal(groups[0].totalAvailable, 48);
  assert.equal(groups[0].totalOnHand, 238);
});

test("central stock list: ไม่มีออเดอร์ค้างส่ง (reserved = 0) ยอดสองคอลัมน์เท่ากัน", () => {
  const groups = groupCentralStockRows([
    row({ skuCode: "K-14PLS-2", productId: "prod-14pls", onHand: 125, reserved: 0 }),
  ]);

  const sku = groups[0].skus[0];
  assert.equal(sku.reserved, 0);
  assert.equal(sku.available, 125);
  assert.equal(sku.onHandTotal, 125);
  assert.equal(groups[0].totalReserved, 0);
  assert.equal(groups[0].totalAvailable, groups[0].totalOnHand);
});

test("central stock list: กลุ่มที่มีราคาหลายระดับแสดงเป็นช่วง min–max และคงไว้ที่แถวหลัก", () => {
  const groups = groupCentralStockRows([
    row({ skuCode: "S-1", productId: "prod-price", price: { min: 350, max: 350 }, onHand: 1 }),
    row({ skuCode: "S-2", productId: "prod-price", price: { min: 199, max: 219 }, onHand: 1 }),
    row({ skuCode: "S-3", productId: "prod-price", price: null, onHand: 1 }),
  ]);

  assert.deepEqual(groups[0].price, { min: 199, max: 350 });
  assert.deepEqual(groups[0].skus[2].price, null, "รหัสที่ยังไม่มีราคาต้องไม่ถูกเดา");
});

test("central stock list: ประกาศหลายร้านของรหัสเดียวรวมราคาเป็นช่วงเดียวกัน", () => {
  const groups = groupCentralStockRows([
    row({
      skuCode: "K-1",
      productId: "prod-1",
      listingCount: 3,
      shopCount: 2,
      price: { min: 120, max: 139 },
      onHand: 9,
      reserved: 1,
    }),
  ]);

  assert.deepEqual(groups[0].price, { min: 120, max: 139 });
  assert.equal(groups[0].listingCount, 3, "ผูกไว้ = จำนวนประกาศรวม");
  assert.equal(groups[0].shopCount, 2);
});

test("central stock list: ราคาว่างทั้งกลุ่มต้องเป็น null ไม่ใช่ 0", () => {
  const groups = groupCentralStockRows([row({ skuCode: "N-1", productId: "prod-none", onHand: 3 })]);

  assert.equal(groups[0].price, null);
  assert.deepEqual(mergePrice(null, null), null);
  assert.deepEqual(mergePrice(null, { min: 5, max: 6 }), { min: 5, max: 6 });
});
