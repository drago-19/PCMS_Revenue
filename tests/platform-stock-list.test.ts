import test from "node:test";
import assert from "node:assert/strict";
import {
  availableOf,
  groupStockRows,
  mergeDuplicateOrders,
  onHandOf,
  variantHint,
  variantLabel,
  variantNameFromSalesAttributes,
  type StockListSkuInput,
} from "@/lib/platform/stock-list";

/**
 * รายการสต็อกหน้า /sale/stocks ต้องเห็นเป็น "สินค้า 1 แถวหลัก + ไซส์เป็นแถวลูก"
 * ไฟล์นี้ทดสอบเฉพาะฟังก์ชันล้วน (ไม่ต่อฐานข้อมูล)
 */

function sku(overrides: Partial<StockListSkuInput> & { skuId: string }): StockListSkuInput {
  return {
    sellerSku: null,
    variantName: null,
    price: null,
    currency: "THB",
    quantity: 0,
    reserved: 0,
    productId: null,
    productName: null,
    imageUrl: null,
    productStatus: "ACTIVATE",
    ...overrides,
  };
}

test("platform stock list: จัดกลุ่มตาม product_id และรวมยอดทุกไซส์ไว้ที่แถวหลัก", () => {
  const groups = groupStockRows([
    sku({
      skuId: "sku-f",
      sellerSku: "K-5ORS-16-F",
      productId: "prod-5ors",
      productName: "เสื้อ Oversize",
      variantName: "Free size",
      price: 199,
      quantity: 12,
      reserved: 2,
      imageUrl: "https://example.test/a.jpg",
    }),
    sku({
      skuId: "sku-p",
      sellerSku: "K-5ORS-16-P",
      productId: "prod-5ors",
      productName: "เสื้อ Oversize",
      variantName: "Plus size",
      price: 219,
      quantity: 4,
      reserved: 1,
    }),
    // สินค้าไม่มีไซส์เลย — ต้องได้กลุ่มของตัวเอง ไม่ถูกไปรวมกับตัวอื่น
    sku({
      skuId: "sku-pls",
      sellerSku: "K-14PLS-2",
      productId: "prod-pls",
      productName: "กางเกงพลัส",
      price: 299,
      quantity: 7,
    }),
  ]);

  assert.equal(groups.length, 2, "สินค้า 2 ตัว = 2 กลุ่ม");

  const first = groups[0]!;
  assert.equal(first.productId, "prod-5ors");
  assert.equal(first.skus.length, 2);
  assert.deepEqual(
    first.skus.map((row) => row.sellerSku),
    ["K-5ORS-16-F", "K-5ORS-16-P"],
    "แถวลูกต้องเรียงตามลำดับที่อ่านมา",
  );
  assert.equal(first.totalStock, 16);
  assert.equal(first.totalReserved, 3);
  assert.equal(first.totalAvailable, 16, "คงเหลือ (ขายได้) = ผลรวม quantity ไม่หักจอง");
  assert.equal(first.totalOnHand, 19, "รวมในมือ = quantity + reserved");
  assert.equal(first.skus[0]!.available, 12);
  assert.equal(first.skus[0]!.onHand, 14);
  assert.equal(first.skus[1]!.available, 4);
  assert.equal(first.skus[1]!.onHand, 5);
  assert.deepEqual(first.price, { min: 199, max: 219 }, "ราคาต่างกันต้องได้เป็นช่วง");
  assert.equal(first.imageUrl, "https://example.test/a.jpg");
  assert.equal(first.skuTotal, 2);

  const second = groups[1]!;
  assert.equal(second.productId, "prod-pls");
  assert.equal(second.skus.length, 1, "สินค้าไม่มีไซส์ = กลุ่มเดียว ไม่มีแถวลูก");
  assert.deepEqual(second.price, { min: 299, max: 299 });
  assert.equal(second.totalAvailable, 7);
  assert.equal(second.totalOnHand, 7, "จอง 0 → รวมในมือเท่ากับคงเหลือ");
});

test("platform stock list: แถวที่ไม่มี product_id แยกเป็นกลุ่มของตัวเองตาม sku_id", () => {
  const groups = groupStockRows([
    sku({ skuId: "sku-a", sellerSku: "A-1", quantity: 1 }),
    sku({ skuId: "sku-b", sellerSku: "B-1", quantity: 2 }),
    sku({ skuId: "sku-c", sellerSku: "C-1", productId: "prod-c", quantity: 3 }),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["sku:sku-a", "sku:sku-b", "product:prod-c"],
  );
  for (const group of groups) assert.equal(group.skus.length, 1);
});

test("platform stock list: คงเหลือ (ขายได้) = quantity · รวมในมือ = quantity + reserved — ไม่หักจองซ้ำ", () => {
  // เคสจริงจากหน้าจอ: K-6TL-134 quantity 48 จอง 190 → ห้ามได้ −142
  const k6tl = { quantity: 48, reserved: 190 };
  assert.equal(availableOf(k6tl), 48, "คงเหลือ (ขายได้) คือ quantity ตามที่แพลตฟอร์มส่งมา");
  assert.equal(onHandOf(k6tl), 238, "รวมในมือ = 48 + 190 (ใกล้ยอดในมือ Shipnity 248)");
  assert.ok(availableOf(k6tl) >= 0, "สูตรใหม่ต้องไม่ทำให้ติดลบ");

  // ไม่มีออเดอร์ค้างส่ง: สองคอลัมน์เท่ากัน
  assert.equal(availableOf({ quantity: 125 }), 125);
  assert.equal(onHandOf({ quantity: 125, reserved: 0 }), 125);
  assert.equal(onHandOf({ quantity: 0, reserved: 0 }), 0);

  // ปัดเป็นจำนวนเต็มก่อนคำนวณ (ค่าจาก API ไม่ควรมีเศษ แต่กันไว้)
  assert.equal(availableOf({ quantity: 2.7 }), 2);
  assert.equal(onHandOf({ quantity: 2.4, reserved: 7.9 }), 9);

  const groups = groupStockRows([
    sku({ skuId: "sku-1", productId: "prod-1", quantity: 3, reserved: 5 }),
    sku({ skuId: "sku-2", productId: "prod-1", quantity: 8, reserved: 2 }),
    sku({ skuId: "sku-3", productId: "prod-2", quantity: 48, reserved: 190 }),
  ]);
  const group = groups[0]!;
  assert.equal(group.totalStock, 11);
  assert.equal(group.totalReserved, 7);
  assert.equal(group.totalAvailable, 11, "ผลรวมแต่ละคอลัมน์ ไม่ใช่ quantity − reserved");
  assert.equal(group.totalOnHand, 18);
  assert.equal(group.skus[0]!.available, 3, "จองเกิน 190 ก็ไม่ทำให้ติดลบ");
  assert.equal(group.skus[0]!.onHand, 8);
  assert.equal(group.skus[1]!.available, 8);
  assert.equal(group.skus[1]!.onHand, 10);

  const k6tlGroup = groups[1]!;
  assert.equal(k6tlGroup.totalAvailable, 48);
  assert.equal(k6tlGroup.totalOnHand, 238);
  assert.equal(k6tlGroup.skus[0]!.available, 48);
  assert.equal(k6tlGroup.skus[0]!.onHand, 238);
});

test("platform stock list: ไม่มี variant_name — ใช้ท้ายรหัสเป็นป้ายชั่วคราว ไม่ขึ้นคำว่าไม่ระบุไซส์", () => {
  const groups = groupStockRows([
    sku({ skuId: "sku-x", sellerSku: "K-5ORS-16-F", productId: "prod-x", quantity: 1 }),
    sku({ skuId: "sku-y", sellerSku: "K-5ORS-16-P", productId: "prod-x", quantity: 1 }),
    sku({ skuId: "sku-z", sellerSku: "K-14PLS-2", productId: "prod-z", quantity: 1 }),
  ]);

  const multi = groups[0]!;
  assert.equal(multi.skus.length, 2);
  assert.deepEqual(
    multi.skus.map((row) => [row.variantName, variantLabel(row.variantName, row.sellerSku)]),
    [
      [null, "ไซส์ F"],
      [null, "ไซส์ P"],
    ],
  );
  for (const row of multi.skus) {
    assert.notEqual(variantLabel(row.variantName, row.sellerSku), "ไม่ระบุไซส์");
    assert.equal(variantHint(row.variantName, row.sellerSku), "ชื่อไซส์จริงจะขึ้นหลังซิงก์รอบถัดไป");
  }
  // รหัสที่ท้ายไม่ใช่ไซส์ (K-14PLS-2) = ห้ามเดา ขึ้น "—" พร้อมบอกว่าไม่มีตัวเลือก
  assert.equal(variantLabel(groups[1]!.skus[0]!.variantName, groups[1]!.skus[0]!.sellerSku), "—");
  assert.equal(
    variantHint(groups[1]!.skus[0]!.variantName, groups[1]!.skus[0]!.sellerSku),
    "สินค้านี้ไม่มีตัวเลือก",
  );
  // รหัสไม่มีขีดต่อท้าย = สินค้านี้ไม่มีตัวเลือก
  assert.equal(variantLabel(null, "NOSIZE01"), "—");
  assert.equal(variantHint(null, "NOSIZE01"), "สินค้านี้ไม่มีตัวเลือก");
  // มีชื่อไซส์จริงจากแพลตฟอร์ม = ใช้ค่านั้น ไม่มี tooltip
  assert.equal(variantLabel("Free size", "K-5ORS-16-F"), "Free size");
  assert.equal(variantHint("Free size", "K-5ORS-16-F"), null);
  // ขีดอยู่ท้ายรหัส/รหัสว่าง = ไม่มีอะไรต่อท้าย
  assert.equal(variantLabel(null, "K-5ORS-16-"), "—");
  assert.equal(variantLabel(null, ""), "—");
});

test("platform stock list: ป้ายไซส์ขึ้นเฉพาะเมื่อท้ายรหัสเป็นไซส์จริง — เลขท้ายรหัสไม่ใช่ไซส์", () => {
  // เคสจริงจากหน้าจอ: K-6TL-96 ขึ้น "ไซส์ 96" ทั้งที่ 96 ไม่ใช่ไซส์
  assert.equal(variantLabel(null, "K-6TL-96"), "—");
  assert.equal(variantHint(null, "K-6TL-96"), "สินค้านี้ไม่มีตัวเลือก");

  // ท้ายรหัสที่เป็นไซส์ที่รู้จัก = ขึ้นป้ายตามรหัส
  assert.equal(variantLabel(null, "K-5ORS-16-F"), "ไซส์ F");
  assert.equal(variantHint(null, "K-5ORS-16-F"), "ชื่อไซส์จริงจะขึ้นหลังซิงก์รอบถัดไป");
  assert.equal(variantLabel(null, "K-5ORS-16-2XL"), "ไซส์ 2XL");
  assert.equal(variantLabel(null, "K-5ORS-16-XXXL"), "ไซส์ XXXL");
  assert.equal(variantLabel(null, "K-5ORS-16-free"), "ไซส์ free", "ตัวพิมพ์เล็กก็นับเป็นไซส์");
  assert.equal(variantLabel(null, "K-5ORS-16-plus"), "ไซส์ plus");

  // ไม่มีขีด / ขีดอยู่ท้าย / ไม่มีรหัส = ไม่มีตัวเลือก
  assert.equal(variantLabel(null, "NOSIZE01"), "—");
  assert.equal(variantLabel(null, "K-5ORS-16-"), "—");
  assert.equal(variantLabel(null, null), "—");

  // มีชื่อไซส์จากแพลตฟอร์ม = ใช้ชื่อจริงเสมอ ไม่สนท้ายรหัส
  assert.equal(variantLabel("Free size", "K-6TL-96"), "Free size");
});

test("platform stock list: ออเดอร์ที่เลขออเดอร์ซ้ำถูกรวมเป็นแถวเดียว (กันคีย์ซ้ำใน React)", () => {
  const orders = [
    { orderId: "587284549020910767", quantity: 1, orderedAt: "2026-11-20T02:00:00Z", status: "AWAITING_SHIPMENT" },
    { orderId: "587284549020910767", quantity: 2, orderedAt: "2026-11-20T02:00:00Z", status: "AWAITING_SHIPMENT" },
    { orderId: "587284549020910769", quantity: 1, orderedAt: "2026-11-19T02:00:00Z", status: "SHIPPED" },
  ];
  const merged = mergeDuplicateOrders(orders);
  assert.equal(merged.length, 2, "เหลือหนึ่งแถวต่อหนึ่งออเดอร์");
  assert.deepEqual(
    merged.map((row) => row.orderId),
    ["587284549020910767", "587284549020910769"],
    "คงลำดับเดิมที่อ่านมา",
  );
  assert.equal(merged[0]!.quantity, 3, "บวกจำนวนของออเดอร์เดียวกัน");
  assert.equal(merged[1]!.quantity, 1);
  assert.deepEqual(mergeDuplicateOrders([]), []);
});

test("platform stock list: ชื่อไซส์อ่านจาก sales_attributes ของ TikTok (value_name ก่อน name)", () => {
  assert.equal(
    variantNameFromSalesAttributes([
      { name: "Size", value_name: "Free size" },
    ]),
    "Free size",
  );
  assert.equal(
    variantNameFromSalesAttributes([
      { name: "Size", value_name: "Plus size" },
      { name: "Color", value_name: "ดำ" },
    ]),
    "Plus size / ดำ",
  );
  assert.equal(variantNameFromSalesAttributes([{ name: "Size" }]), "Size", "ไม่มี value_name ใช้ name");
  assert.equal(variantNameFromSalesAttributes([]), "", "ไม่มีข้อมูล = ค่าว่าง ไม่เดาค่า");
  assert.equal(variantNameFromSalesAttributes(null), "");
  assert.equal(variantNameFromSalesAttributes([{ name: "  ", value_name: " " }]), "");
});

test("platform stock list: แถวหลักใช้ยอดรวมทั้งสินค้า แม้บางไซส์ไม่อยู่ในหน้านี้", () => {
  const groups = groupStockRows(
    [sku({ skuId: "sku-1", sellerSku: "K-1", productId: "prod-1", quantity: 4, reserved: 1, price: 99 })],
    { "prod-1": { stock: 20, reserved: 6, skus: 5, price: { min: 99, max: 149 } } },
  );
  const group = groups[0]!;
  assert.equal(group.skus.length, 1, "หน้านี้เห็นไซส์เดียว");
  assert.equal(group.skuTotal, 5, "บอกจำนวนไซส์จริงของสินค้า");
  assert.equal(group.totalStock, 20, "ยอดบนแถวหลักคือของทุกไซส์");
  assert.equal(group.totalReserved, 6);
  assert.equal(group.totalAvailable, 20, "คงเหลือ (ขายได้) ของทั้งสินค้า = ผลรวม quantity");
  assert.equal(group.totalOnHand, 26, "รวมในมือของทั้งสินค้า = 20 + 6");
  assert.deepEqual(group.price, { min: 99, max: 149 });
  // แถวลูกยังเป็นตัวเลขของรหัสนั้นเอง
  assert.equal(group.skus[0]!.available, 4);
  assert.equal(group.skus[0]!.onHand, 5);
});
