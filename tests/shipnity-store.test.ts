import { test } from "node:test";
import assert from "node:assert/strict";
import type { ShipnityOrder } from "../src/lib/shipnity/client";
import { buildStoredOrder, contentHashOf } from "../src/lib/shipnity/store";

function makeOrder(overrides: Partial<ShipnityOrder> = {}): ShipnityOrder {
  return {
    id: 136162977,
    invoice_number: "ES99",
    created_at: "2026-11-11T09:12:20+07:00",
    price: "189.0",
    paid: true,
    printed: false,
    payment_accepted: true,
    transferred: true,
    closed: false,
    cancelled: false,
    packed: false,
    order_bank: "tiktok",
    shipping_type: "J&T Express",
    name: "ลูกค้าทดสอบ",
    purchases: [
      {
        id: 1,
        code: "K-11PLL-7-P",
        name: "เลคกิ้งขาระบาย ดำ (Plus size)",
        quantity: 1,
        price: "290.0",
        discount: "190.0",
        thumb: "https://s3-ap-southeast-1.amazonaws.com/x.jpg?X-Amz-Signature=aaa",
      },
    ],
    ...overrides,
  } as ShipnityOrder;
}

test("แปลงออเดอร์เป็นแถวที่จะบันทึก และคืน null เมื่อไม่มีวันที่สร้าง", () => {
  const row = buildStoredOrder("shop-1", makeOrder());
  assert.ok(row);
  assert.equal(row.accountKey, "shop-1");
  assert.equal(row.orderId, 136162977);
  assert.equal(row.invoiceNumber, "ES99");
  assert.equal(row.createdAt, "2026-11-11T02:12:20.000Z");
  assert.equal(row.price, 189);
  assert.equal(row.paid, true);
  assert.equal(row.printed, false);
  assert.equal(row.orderBank, "tiktok");

  assert.equal(buildStoredOrder("shop-1", makeOrder({ created_at: undefined })), null);
  assert.equal(buildStoredOrder("shop-1", makeOrder({ created_at: "ไม่ใช่วันที่" })), null);
});

test("content_hash ไม่เปลี่ยนเมื่อแค่ URL รูปเปลี่ยน แต่เปลี่ยนเมื่อข้อมูลธุรกิจเปลี่ยน", () => {
  const base = makeOrder();
  const hash = contentHashOf(base);

  const newPhotoUrl = makeOrder();
  newPhotoUrl.purchases = (newPhotoUrl.purchases ?? []).map((purchase) => ({
    ...purchase,
    thumb: "https://s3-ap-southeast-1.amazonaws.com/x.jpg?X-Amz-Signature=bbb",
  }));
  assert.equal(contentHashOf(newPhotoUrl), hash);

  assert.notEqual(contentHashOf(makeOrder({ printed: true })), hash);
  assert.notEqual(contentHashOf(makeOrder({ paid: false })), hash);
  assert.notEqual(contentHashOf(makeOrder({ closed: true })), hash);
  assert.notEqual(contentHashOf(makeOrder({ price: "299.0" })), hash);
});
