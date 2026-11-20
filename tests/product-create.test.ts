import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateProductPayload,
  DEFAULT_SIZE_ATTRIBUTE_NAME,
  type CreateProductInput,
} from "@/lib/platform/product-payload";

/**
 * payload ของ POST /product/202309/products — ทดสอบเฉพาะฟังก์ชันล้วน (ไม่ต่อฐานข้อมูล/ไม่ยิง TikTok)
 * กติกาหลัก: รหัสเดียวต้องไม่มี sales_attributes, หลายไซส์ต้องส่ง sales_attributes ครบทุก SKU
 */

const base: CreateProductInput = {
  title: "เสื้อ Oversize ผ้าคอตตอน 100% ทรงหลวม",
  description: "เสื้อ Oversize",
  categoryId: "600001",
  imageUri: "tos-maliva-i-o3syd03w52-us/test-image-uri",
  weightGrams: 200,
  warehouseId: "7401234567890123456",
  skus: [],
};

test("product create payload: รหัสเดียว — ไม่ส่ง sales_attributes", () => {
  const payload = buildCreateProductPayload({
    ...base,
    skus: [{ sellerSku: "K-14PLS-2", price: 199, quantity: 5 }],
  });

  assert.equal(payload.skus.length, 1);
  assert.equal(payload.skus[0].seller_sku, "K-14PLS-2");
  assert.equal(payload.skus[0].price.amount, "199.00");
  assert.equal(payload.skus[0].price.currency, "THB");
  assert.deepEqual(payload.skus[0].inventory, [{ warehouse_id: base.warehouseId, quantity: 5 }]);
  assert.equal("sales_attributes" in payload.skus[0], false);
  assert.equal(payload.category_version, "v2");
  assert.deepEqual(payload.main_images, [{ uri: base.imageUri }]);
  assert.deepEqual(payload.package_weight, { value: "200", unit: "GRAM" });
});

test("product create payload: หลายไซส์ — ได้ skus ครบทุกแถวและ sales_attributes ตามชื่อไซส์", () => {
  const payload = buildCreateProductPayload({
    ...base,
    skus: [
      { sellerSku: "K-5ORS-16-F", sizeName: "Free size", price: 259, quantity: 12 },
      { sellerSku: "K-5ORS-16-P", sizeName: "Plus size", price: 289, quantity: 4 },
    ],
  });

  assert.equal(payload.skus.length, 2);
  assert.deepEqual(
    payload.skus.map((sku) => sku.seller_sku),
    ["K-5ORS-16-F", "K-5ORS-16-P"],
  );
  assert.deepEqual(payload.skus[0].sales_attributes, [
    { name: DEFAULT_SIZE_ATTRIBUTE_NAME, value_name: "Free size" },
  ]);
  assert.deepEqual(payload.skus[1].sales_attributes, [
    { name: DEFAULT_SIZE_ATTRIBUTE_NAME, value_name: "Plus size" },
  ]);
  assert.equal(payload.skus[1].price.amount, "289.00");
  assert.deepEqual(payload.skus[1].inventory, [{ warehouse_id: base.warehouseId, quantity: 4 }]);
});

test("product create payload: เปลี่ยนชื่อแอตทริบิวต์ไซส์ได้ และตัดช่องว่างหัวท้าย", () => {
  const payload = buildCreateProductPayload({
    ...base,
    sizeAttributeName: "ไซส์",
    skus: [{ sellerSku: "  K-6TL-134  ", sizeName: "  XL  ", price: 320.5, quantity: 0 }],
  });

  assert.equal(payload.skus[0].seller_sku, "K-6TL-134");
  assert.equal(payload.skus[0].price.amount, "320.50");
  assert.deepEqual(payload.skus[0].sales_attributes, [{ name: "ไซส์", value_name: "XL" }]);
});

test("product create payload: รหัสย่อยซ้ำต้อง throw", () => {
  assert.throws(
    () =>
      buildCreateProductPayload({
        ...base,
        skus: [
          { sellerSku: "K-5ORS-16-F", sizeName: "Free size", price: 259, quantity: 1 },
          { sellerSku: "k-5ors-16-f", sizeName: "Plus size", price: 289, quantity: 1 },
        ],
      }),
    /รหัสย่อยซ้ำ/,
  );
});

test("product create payload: ราคา ≤ 0 ต้อง throw", () => {
  assert.throws(
    () => buildCreateProductPayload({ ...base, skus: [{ sellerSku: "K-0", price: 0, quantity: 1 }] }),
    /ราคา/,
  );
  assert.throws(
    () => buildCreateProductPayload({ ...base, skus: [{ sellerSku: "K-1", price: -5, quantity: 1 }] }),
    /ราคา/,
  );
});

test("product create payload: สต็อกติดลบหรือไม่ใช่จำนวนเต็มต้อง throw", () => {
  assert.throws(
    () => buildCreateProductPayload({ ...base, skus: [{ sellerSku: "K-2", price: 100, quantity: -1 }] }),
    /สต็อก/,
  );
  assert.throws(
    () => buildCreateProductPayload({ ...base, skus: [{ sellerSku: "K-2", price: 100, quantity: 1.5 }] }),
    /สต็อก/,
  );
});

test("product create payload: ต้องมีอย่างน้อย 1 รหัส และห้ามรหัสว่าง", () => {
  assert.throws(() => buildCreateProductPayload({ ...base, skus: [] }), /อย่างน้อย 1 รหัส/);
  assert.throws(
    () => buildCreateProductPayload({ ...base, skus: [{ sellerSku: "   ", price: 100, quantity: 1 }] }),
    /รหัสย่อย/,
  );
});

test("product create payload: ไซส์ว่าง (ช่องว่างล้วน) ถือว่าไม่มีตัวเลือก", () => {
  const payload = buildCreateProductPayload({
    ...base,
    skus: [{ sellerSku: "K-5ORS-16", sizeName: "   ", price: 199, quantity: 2 }],
  });

  assert.equal("sales_attributes" in payload.skus[0], false);
});
