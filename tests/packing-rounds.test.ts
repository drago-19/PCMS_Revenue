import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_COURIER_LABEL,
  bangkokDateParts,
  buildPackingRounds,
  courierLabel,
  daysPendingBangkok,
  groupOrdersByCourier,
  packingCutoffFor,
  parseInstant,
  resolveCutAt,
  resolveRound,
  type PackingOrderInput,
} from "../src/lib/packing-rounds";

const NOW_AFTERNOON = new Date("2026-11-10T08:00:00.000Z"); // 15.00 น. เวลาไทย 10 พ.ย. 2026
const NOW_MORNING = new Date("2026-11-10T00:30:00.000Z"); // 07.30 น. เวลาไทย

test("เวลาตัดรอบคือ 14.00 น. เวลาไทยของวันนั้น ไม่ขึ้นกับ timezone ของเครื่อง", () => {
  assert.equal(packingCutoffFor(NOW_AFTERNOON).toISOString(), "2026-11-10T07:00:00.000Z");
  assert.equal(packingCutoffFor(NOW_MORNING).toISOString(), "2026-11-10T07:00:00.000Z");
  assert.deepEqual(bangkokDateParts(NOW_MORNING), { year: 2026, month: 11, day: 10 });
});

test("ออเดอร์ก่อน 14.00 น. อยู่รอบนี้ ตั้งแต่ 14.00 น. ไปรอบถัดไป", () => {
  const before = new Date("2026-11-10T06:59:59.000Z"); // 13.59.59 น.
  const exact = new Date("2026-11-10T07:00:00.000Z"); // 14.00.00 น.
  const after = new Date("2026-11-10T07:00:01.000Z");

  assert.equal(resolveRound(before, NOW_AFTERNOON), "current");
  assert.equal(resolveRound(exact, NOW_AFTERNOON), "next");
  assert.equal(resolveRound(after, NOW_AFTERNOON), "next");
});

test("แปลงเวลาที่ไม่มี timezone เป็นเวลาไทย และคง ISO ที่มี timezone ไว้", () => {
  assert.equal(parseInstant("2026-11-10 13:45:00")?.toISOString(), "2026-11-10T06:45:00.000Z");
  assert.equal(parseInstant("2026-11-10T13:45:00")?.toISOString(), "2026-11-10T06:45:00.000Z");
  assert.equal(parseInstant("2026-11-10")?.toISOString(), "2026-11-09T17:00:00.000Z");
  assert.equal(parseInstant("2026-11-10T06:45:00.000Z")?.toISOString(), "2026-11-10T06:45:00.000Z");
  assert.equal(parseInstant("ไม่ใช่วันที่"), null);
  assert.equal(parseInstant(""), null);
  assert.equal(parseInstant(null), null);
});

test("เวลาตัดรอบของออเดอร์ใช้เวลาสั่งของก่อน เวลาชำระเป็นตัวสำรอง", () => {
  const ordered = resolveCutAt({
    orderCode: "A1",
    paidAt: "2026-11-10 16:00:00",
    createdAt: "2026-11-10 13:00:00",
  });
  assert.equal(ordered?.toISOString(), "2026-11-10T06:00:00.000Z");

  const paidOnly = resolveCutAt({ orderCode: "A2", createdAt: null, paidAt: "2026-11-10 15:00:00" });
  assert.equal(paidOnly?.toISOString(), "2026-11-10T08:00:00.000Z");

  assert.equal(resolveCutAt({ orderCode: "A3", paidAt: null, createdAt: null }), null);
});

test("นับวันที่ค้างตามปฏิทินไทย", () => {
  assert.equal(daysPendingBangkok(new Date("2026-11-10T02:00:00.000Z"), NOW_AFTERNOON), 0);
  assert.equal(daysPendingBangkok(new Date("2026-11-09T03:00:00.000Z"), NOW_AFTERNOON), 1);
  assert.equal(daysPendingBangkok(new Date("2026-11-07T03:00:00.000Z"), NOW_AFTERNOON), 3);
  // 22.00 น. เวลาไทยของเมื่อวาน ยังนับเป็นเมื่อวาน ไม่ใช่ "เมื่อ 5 ชั่วโมงก่อน"
  assert.equal(daysPendingBangkok(new Date("2026-11-09T15:00:00.000Z"), NOW_AFTERNOON), 1);
});

test("ป้ายขนส่งว่างกลายเป็นป้ายกลาง", () => {
  assert.equal(courierLabel("  Flash  "), "Flash");
  assert.equal(courierLabel(""), NO_COURIER_LABEL);
  assert.equal(courierLabel(null), NO_COURIER_LABEL);
});

test("จัดกลุ่มตามขนส่ง ของเก่าสุดขึ้นก่อน และรวมยอดในกลุ่ม", () => {
  const orders = [
    {
      orderCode: "NEW",
      courier: "Kerry",
      itemCount: 2,
      items: [],
      totalAmount: 250,
      cutAt: new Date("2026-11-10T06:00:00.000Z"),
      round: "current" as const,
      daysPending: 0,
      customerName: null,
      marketplace: null,
    },
    {
      orderCode: "OLD",
      courier: "Kerry",
      itemCount: 1,
      items: [],
      totalAmount: 100,
      cutAt: new Date("2026-11-09T05:00:00.000Z"),
      round: "current" as const,
      daysPending: 1,
      customerName: null,
      marketplace: null,
    },
    {
      orderCode: "FLASH1",
      courier: "Flash",
      itemCount: 3,
      items: [],
      totalAmount: 500,
      cutAt: new Date("2026-11-10T04:00:00.000Z"),
      round: "current" as const,
      daysPending: 0,
      customerName: null,
      marketplace: null,
    },
  ];

  const groups = groupOrdersByCourier(orders);
  assert.deepEqual(
    groups.map((group) => group.courier),
    ["Flash", "Kerry"],
  );
  const kerry = groups.find((group) => group.courier === "Kerry");
  assert.deepEqual(
    kerry?.orders.map((order) => order.orderCode),
    ["OLD", "NEW"],
  );
  assert.equal(kerry?.orderCount, 2);
  assert.equal(kerry?.itemCount, 3);
  assert.equal(kerry?.totalAmount, 350);
});

test("สรุปสองรอบพร้อมกัน และข้ามออเดอร์ที่ไม่มีวันเวลา", () => {
  const orders: PackingOrderInput[] = [
    { orderCode: "T1", courier: "Flash", paidAt: "2026-11-10 09:30:00", itemCount: 1, totalAmount: 100 },
    { orderCode: "T2", courier: "Flash", paidAt: "2026-11-09 16:00:00", itemCount: 2, totalAmount: 200 },
    { orderCode: "N1", courier: "Kerry", createdAt: "2026-11-10 14:00:00", itemCount: 1, totalAmount: 300 },
    { orderCode: "X1", courier: "Kerry", paidAt: null, createdAt: null },
  ];

  const rounds = buildPackingRounds(orders, NOW_AFTERNOON);

  assert.equal(rounds.cutoffAt.toISOString(), "2026-11-10T07:00:00.000Z");
  // ตัดรอบด้วย 14:00 ของ “วันที่สั่ง” — T2 สั่ง 16:00 ของ 9 พ.ย. จึงอยู่รอบหลังบ่ายสอง
  assert.equal(rounds.currentOrderCount, 1);
  assert.equal(rounds.nextOrderCount, 2);
  assert.deepEqual(rounds.skippedOrderCodes, ["X1"]);

  assert.deepEqual(
    rounds.current[0].orders.map((order) => order.orderCode),
    ["T1"],
  );
  assert.equal(rounds.current[0].orders[0].daysPending, 0);
  assert.deepEqual(
    rounds.next.map((group) => group.courier),
    ["Flash", "Kerry"],
  );
});
