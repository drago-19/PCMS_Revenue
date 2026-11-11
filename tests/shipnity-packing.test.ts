import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHIPNITY_PAGE_SIZE,
  ShipnityError,
  fetchOrdersPage,
  listAllOrders,
  shiftIsoDay,
  shipnityCredentialsFromEnv,
  toShipnityDate,
  type ShipnityOrder,
  type ShipnityOrdersPage,
} from "../src/lib/shipnity/client";
import {
  buildDayPackingSummary,
  collectWaitingPaymentOrders,
  countShipnityStatuses,
  describeOrderStatus,
  isOrderFromDay,
  mergeProductRows,
  summarizeChannels,
  toPackingOrderInput,
} from "../src/lib/shipnity/packing";
import { addShipnityAccount, parseShipnityAccounts } from "../src/lib/shipnity/config";

function rawOrder(overrides: Partial<ShipnityOrder> = {}): ShipnityOrder {
  return {
    id: 1,
    invoice_number: "ES01",
    created_at: "2026-11-10T09:00:00+07:00",
    transferred_at: "2026-11-10T09:05:00+07:00",
    price: "100.0",
    paid: true,
    closed: false,
    packed: false,
    cancelled: false,
    shipping_type: "J&T Express",
    contact_method: "Tiktok",
    name: "ลูกค้าทดสอบ",
    purchases: [
      { code: "SKU-1", name: "เลคกิ้งขาระบาย", quantity: 2, price: "290.0" },
    ],
    ...overrides,
  };
}

test("ออเดอร์ที่ชำระแล้วและยังไม่ส่ง ถูกแปลงเป็นรายการรอแพ็คครบ", () => {
  const input = toPackingOrderInput(rawOrder());
  assert.ok(input);
  assert.equal(input.orderCode, "ES01");
  assert.equal(input.courier, "J&T Express");
  assert.equal(input.marketplace, "Tiktok");
  assert.equal(input.itemCount, 2);
  assert.equal(input.totalAmount, 100);
  assert.equal(input.paidAt, "2026-11-10T09:05:00+07:00");
  assert.deepEqual(input.items, [{ name: "เลคกิ้งขาระบาย", quantity: 2, image: null }]);
});

test("ออเดอร์ที่ยังไม่ชำระ / ปิดแล้ว / แพ็คแล้ว / ยกเลิก ไม่เข้าใบแพ็ค", () => {
  assert.equal(toPackingOrderInput(rawOrder({ paid: false })), null);
  assert.equal(toPackingOrderInput(rawOrder({ closed: true })), null);
  assert.equal(toPackingOrderInput(rawOrder({ packed: true })), null);
  assert.equal(toPackingOrderInput(rawOrder({ cancelled: true })), null);
});

test("ออเดอร์ไม่มีชื่อสินค้าใช้รหัสสินค้าแทน และจำนวนที่ไม่ถูกต้องกลายเป็น 0", () => {
  const input = toPackingOrderInput(
    rawOrder({ purchases: [{ code: "K-11PLL", name: "", quantity: null }] }),
  );
  assert.deepEqual(input?.items, [{ name: "K-11PLL", quantity: 0, image: null }]);
  assert.equal(input?.itemCount, 0);
});

test("เก็บรูปสินค้า (thumb) จาก Shipnity ไว้ใช้ในตารางแพ็ค", () => {
  const input = toPackingOrderInput(
    rawOrder({
      purchases: [
        { code: "K1", name: "กางเกงบาเรล", quantity: 1, thumb: "https://cdn.example.com/a.jpg" },
      ],
    }),
  );
  assert.equal(input?.items?.[0]?.image, "https://cdn.example.com/a.jpg");
});

test("ออเดอร์ COD (pay_later) เข้าใบแพ็คแม้ยังไม่ชำระ และไม่ถูกนับเป็นค้างจ่าย", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "C1",
      paid: false,
      transferred_at: null,
      order_bank: "pay_later",
      created_at: "2026-11-11T08:00:00+07:00",
    }),
    rawOrder({
      id: 2,
      invoice_number: "U1",
      paid: false,
      transferred_at: null,
      order_bank: "facebook",
      created_at: "2026-11-11T09:00:00+07:00",
    }),
  ];

  const summary = buildDayPackingSummary(orders, "2026-11-11");
  assert.equal(summary.totalOrders, 1);
  assert.equal(summary.waitingPaymentCount, 1);
  assert.equal(summary.rounds.current[0].orders[0].orderCode, "C1");
  assert.equal(summary.rounds.current[0].orders[0].status, "เก็บเงินปลายทาง (COD)");

  assert.deepEqual(
    collectWaitingPaymentOrders(orders, "2026-11-11").map((row) => row.orderCode),
    ["U1"],
  );
});

test("สรุปของวันหนึ่ง: แยกรอบนี้/รอบถัดไป/ยังไม่ชำระ/ปิดแล้ว และแยกตามวัน", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "T1",
      created_at: "2026-11-10T08:55:00+07:00",
      transferred_at: "2026-11-10T09:00:00+07:00",
    }),
    rawOrder({
      id: 2,
      invoice_number: "T2",
      created_at: "2026-11-09T15:50:00+07:00",
      transferred_at: "2026-11-09T16:00:00+07:00",
    }),
    rawOrder({
      id: 3,
      invoice_number: "N1",
      created_at: "2026-11-10T15:25:00+07:00",
      transferred_at: "2026-11-10T15:30:00+07:00",
    }),
    rawOrder({ id: 4, invoice_number: "U1", paid: false, transferred_at: null }),
    rawOrder({ id: 5, invoice_number: "P1", packed: true }),
    rawOrder({ id: 6, invoice_number: "C1", closed: true }),
  ];

  const summary = buildDayPackingSummary(orders, "2026-11-10");
  assert.equal(summary.rounds.currentOrderCount, 1);
  assert.equal(summary.rounds.nextOrderCount, 1);
  assert.equal(summary.waitingPaymentCount, 1);
  assert.equal(summary.closedCount, 2);
  assert.equal(summary.totalOrders, 2);
  assert.deepEqual(
    summary.rounds.current[0].orders.map((order) => order.orderCode),
    ["T1"],
  );

  const history = buildDayPackingSummary(orders, "2026-11-10", { includeClosed: true });
  assert.equal(history.totalOrders, 4);
  assert.equal(history.closedCount, 2);
});

test("มุมมองวันนี้: ออเดอร์ค้างจากวันก่อนต้องติดมาด้วย พร้อมบอกจำนวนวันที่ค้าง", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "Y1",
      created_at: "2026-11-10T15:55:00+07:00",
      transferred_at: "2026-11-10T16:00:00+07:00",
    }),
    rawOrder({
      id: 2,
      invoice_number: "T1",
      created_at: "2026-11-11T08:55:00+07:00",
      transferred_at: "2026-11-11T09:00:00+07:00",
    }),
    rawOrder({
      id: 3,
      invoice_number: "Y0",
      created_at: "2026-11-10T09:55:00+07:00",
      transferred_at: "2026-11-10T10:00:00+07:00",
      closed: true,
    }),
  ];

  const strict = buildDayPackingSummary(orders, "2026-11-11");
  assert.equal(strict.totalOrders, 1);

  const withCarry = buildDayPackingSummary(orders, "2026-11-11", { carryOverOpen: true });
  assert.equal(withCarry.totalOrders, 2);
  // Y1 สั่ง 15:55 ของ 10 พ.ย. → อยู่รอบหลังบ่ายสอง, T1 สั่ง 08:55 ของ 11 พ.ย. → รอบก่อนบ่ายสอง
  assert.equal(withCarry.rounds.currentOrderCount, 1);
  assert.equal(withCarry.rounds.nextOrderCount, 1);
  const carried = [...withCarry.rounds.current, ...withCarry.rounds.next]
    .flatMap((group) => group.orders)
    .find((order) => order.orderCode === "Y1");
  assert.equal(carried?.daysPending, 1);
});

test("สรุปตามสินค้ารวมข้ามออเดอร์ และบอกว่าอยู่ในบิลไหน", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "A1",
      transferred_at: "2026-11-10T09:00:00+07:00",
      purchases: [{ code: "K1", name: "กางเกงบาเรล ดำ (Free size)", quantity: 2 }],
    }),
    rawOrder({
      id: 2,
      invoice_number: "A2",
      transferred_at: "2026-11-10T10:00:00+07:00",
      purchases: [
        { code: "K1", name: "กางเกงบาเรล ดำ (Free size)", quantity: 1 },
        { code: "K2", name: "เลคกิ้งขาระบาย ดำ (Free size)", quantity: 3 },
      ],
    }),
  ];

  const summary = buildDayPackingSummary(orders, "2026-11-10");
  assert.equal(summary.totalItems, 6);
  // ยอดเท่ากันจึงเรียงตามชื่อ (localeCompare th)
  assert.deepEqual(
    summary.products.map((product) => ({
      name: product.name,
      quantity: product.quantity,
      orderCount: product.orderCount,
      orderCodes: product.orderCodes,
      image: product.image,
    })),
    [
      {
        name: "กางเกงบาเรล ดำ (Free size)",
        quantity: 3,
        orderCount: 2,
        orderCodes: ["A1", "A2"],
        image: null,
      },
      {
        name: "เลคกิ้งขาระบาย ดำ (Free size)",
        quantity: 3,
        orderCount: 1,
        orderCodes: ["A2"],
        image: null,
      },
    ],
  );

  // แยกตามช่องทางของสินค้า + รายการบิลของสินค้านั้น
  assert.deepEqual(summary.products[0].channels, [
    { channel: "Tiktok", quantity: 3, orderCount: 2 },
  ]);
  assert.deepEqual(
    summary.products[0].lines.map((line) => line.orderCode),
    ["A1", "A2"],
  );
});

test("credential แยกตามบริษัท: seeheng ต้องไม่มีของ dragon19", () => {
  delete process.env.SHIPNITY_API_TOKEN__SEEHENG;
  delete process.env.SHIPNITY_API_EMAIL__SEEHENG;
  process.env.SHIPNITY_API_TOKEN = "dragon-token";
  process.env.SHIPNITY_API_EMAIL = "shop@example.com";

  assert.deepEqual(shipnityCredentialsFromEnv("dragon19"), {
    token: "dragon-token",
    email: "shop@example.com",
  });
  assert.equal(shipnityCredentialsFromEnv("seeheng"), null);

  process.env.SHIPNITY_API_TOKEN__SEEHENG = "seeheng-token";
  process.env.SHIPNITY_API_EMAIL__SEEHENG = "seeheng@example.com";
  assert.deepEqual(shipnityCredentialsFromEnv("seeheng"), {
    token: "seeheng-token",
    email: "seeheng@example.com",
  });

  delete process.env.SHIPNITY_API_TOKEN__SEEHENG;
  delete process.env.SHIPNITY_API_EMAIL__SEEHENG;
});

test("แปลงวันที่เป็นรูปแบบ DD-MM-YYYY และเลื่อนวันได้", () => {
  assert.equal(toShipnityDate("2026-11-10"), "10-11-2026");
  assert.equal(shiftIsoDay("2026-11-10", -3), "2026-11-07");
  assert.equal(shiftIsoDay("2026-03-01", -1), "2026-02-28");
  assert.throws(() => toShipnityDate("10/11/2026"));
});

const CREDS = { token: "token-ทดสอบ", email: "shop@example.com" };

test("วนทุกหน้าจนครบ และไม่เก็บออเดอร์ซ้ำ", () => {
  const pages: ShipnityOrder[][] = [
    Array.from({ length: SHIPNITY_PAGE_SIZE }, (_, index) => rawOrder({ id: index + 1 })),
    Array.from({ length: SHIPNITY_PAGE_SIZE }, (_, index) => rawOrder({ id: index + 16 })),
    Array.from({ length: 3 }, (_, index) => rawOrder({ id: index + 31 })),
  ];
  const requested: number[] = [];

  return listAllOrders({ credentials: CREDS }, async (page) => {
    requested.push(page);
    return { orders: pages[page - 1] ?? [], options: {} } as ShipnityOrdersPage;
  }).then((orders) => {
    assert.equal(orders.length, 33);
    // ดึงทีละ 3 หน้าพร้อมกัน จึงอาจมีหน้าที่ 4 ถูกเรียกค้างมาก่อนรู้ว่าหน้า 3 เป็นหน้าสุดท้าย
    // และหน้าสั้น (3, 4) จะถูกขอย้ำอีกครั้งเพื่อกันข้อมูลขาด
    assert.equal(requested[0], 1);
    assert.equal(requested.length <= 6, true);
    assert.equal(new Set(orders.map((order) => order.id)).size, 33);
  });
});

test("หยุดวนเมื่อหน้ามีน้อยกว่าหนึ่งหน้าเต็ม", () => {
  const requested: number[] = [];
  return listAllOrders({ credentials: CREDS, maxPages: 10 }, async (page) => {
    requested.push(page);
    return { orders: [rawOrder({ id: page })], options: {} };
  }).then((orders) => {
    assert.equal(orders.length, 1);
    // หน้าสั้นถูกขอย้ำหนึ่งครั้งก่อนสรุปว่าจบ
    assert.deepEqual(requested, [1, 1]);
  });
});

test("หน้าสั้นที่เกิดจากการถูกจำกัดอัตรา: ขอย้ำแล้วได้ครบ จึงไล่หน้าต่อ", () => {
  const requested: number[] = [];
  return listAllOrders({ credentials: CREDS, maxPages: 2 }, async (page) => {
    requested.push(page);
    const times = requested.filter((seen) => seen === page).length;
    // หน้า 1 ตอบสั้น 4 ใบในครั้งแรก (จำกัดอัตรา) ครั้งที่สองได้ครบ 15 ใบ
    // หน้า 2 เป็นหน้าสุดท้ายจริง (4 ใบ) — ขอย้ำแล้วยังได้ 4 ใบ จึงจบ
    const length = page === 1 ? (times === 1 ? 4 : 15) : 4;
    return {
      orders: Array.from({ length }, (_, index) => rawOrder({ id: page * 100 + index })),
      options: {},
    } as ShipnityOrdersPage;
  }).then((orders) => {
    assert.equal(orders.length, 19);
    assert.equal(requested[0], 1);
    assert.equal(requested.filter((page) => page === 1).length, 2);
  });
});

test("fetchOrdersPage ส่ง header ตามรูปแบบที่ Shipnity กำหนด", async () => {
  let seenUrl = "";
  let seenAuth = "";
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(url);
    seenAuth = String((init?.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ orders: [rawOrder()], options: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const page = await fetchOrdersPage({ credentials: CREDS, filter: "open", page: 2 }, fakeFetch);
  assert.equal(page.orders.length, 1);
  assert.equal(seenUrl, "https://www.shipnity.pro/api/v2/orders?filter=open&page=2");
  assert.equal(seenAuth, "Token token=token-ทดสอบ, email=shop@example.com");
});

test("fetchOrdersPage ส่งช่วงวันที่เป็น DD-MM-YYYY", async () => {
  let seenUrl = "";
  const fakeFetch = (async (url: string | URL | Request) => {
    seenUrl = String(url);
    return new Response(JSON.stringify({ orders: [], options: {} }), { status: 200 });
  }) as typeof fetch;

  await fetchOrdersPage(
    { credentials: CREDS, filter: "closed", fromDay: "2026-11-09", toDay: "2026-11-10" },
    fakeFetch,
  );
  const parsed = new URL(seenUrl);
  assert.equal(parsed.searchParams.get("filter_start"), "09-11-2026");
  assert.equal(parsed.searchParams.get("filter_end_date"), "10-11-2026");
});

test("fetchOrdersPage แปลง 401 เป็นข้อความบอกวิธีแก้", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: "Bad credentials" }), { status: 401 })) as typeof fetch;

  await assert.rejects(
    () => fetchOrdersPage({ credentials: CREDS }, fakeFetch),
    (error: unknown) =>
      error instanceof ShipnityError && error.status === 401 && /token/i.test(error.message),
  );
});

test("เพิ่มบัญชี: ตรวจอีเมลและ token ก่อนแตะฐานข้อมูล", async () => {
  await assert.rejects(
    () => addShipnityAccount({ email: "ไม่ใช่อีเมล", token: "x".repeat(40) }, "tester"),
    /อีเมล/,
  );
  await assert.rejects(
    () => addShipnityAccount({ email: "shop@example.com", token: "สั้น" }, "tester"),
    /token/,
  );
});

test("แปลงบัญชี Shipnity ที่เก็บไว้: หลายบัญชี รูปแบบเดี่ยวเดิม และค่าที่พัง", () => {
  const many = parseShipnityAccounts({
    accounts: [
      { id: "a1", label: "Kissi", email: "kissi@example.com", token: "t".repeat(30) },
      { id: "a2", label: "", email: "shop2@example.com", token: "u".repeat(30) },
      { email: "ไม่มี token" },
    ],
  });
  assert.equal(many.length, 2);
  assert.equal(many[0].label, "Kissi");
  assert.equal(many[1].label, "shop2@example.com");

  const legacy = parseShipnityAccounts({ email: "old@example.com", token: "v".repeat(30) });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].email, "old@example.com");
  assert.equal(legacy[0].id, "acct-1");

  assert.deepEqual(parseShipnityAccounts(null), []);
  assert.deepEqual(parseShipnityAccounts("ไม่ใช่ json"), []);
  assert.deepEqual(parseShipnityAccounts({ accounts: [] }), []);
});

test("รวมสรุปสินค้าของหลายร้านเป็นชุดเดียว พร้อมรูปและรายการบิล", () => {
  const merged = mergeProductRows([
    [
      {
        name: "กางเกงบาเรล ดำ (Free size)",
        quantity: 2,
        orderCount: 1,
        orderCodes: ["A1"],
        image: "https://cdn.example.com/barrel.jpg",
        channels: [{ channel: "Tiktok", quantity: 2, orderCount: 1 }],
        lines: [
          {
            orderCode: "A1",
            channel: "Tiktok",
            quantity: 2,
            courier: "J&T Express",
            customerName: null,
            paidAt: "2026-11-11T02:00:00.000Z",
          },
        ],
      },
    ],
    [
      {
        name: "กางเกงบาเรล ดำ (Free size)",
        quantity: 1,
        orderCount: 1,
        orderCodes: ["B9"],
        channels: [{ channel: "Shopee", quantity: 1, orderCount: 1 }],
        lines: [
          {
            orderCode: "B9",
            channel: "Shopee",
            quantity: 1,
            courier: "J&T Express",
            customerName: null,
            paidAt: "2026-11-11T03:00:00.000Z",
          },
        ],
      },
    ],
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
  assert.equal(merged[0].orderCount, 2);
  assert.deepEqual(merged[0].orderCodes, ["A1", "B9"]);
  assert.equal(merged[0].image, "https://cdn.example.com/barrel.jpg");
  assert.deepEqual(merged[0].channels, [
    { channel: "Tiktok", quantity: 2, orderCount: 1 },
    { channel: "Shopee", quantity: 1, orderCount: 1 },
  ]);
  assert.equal(merged[0].lines.length, 2);
});

test("ออเดอร์เดียวมีสินค้าชื่อเดียวกันหลายรายการ รวมเป็นบรรทัดเดียว (กัน key ซ้ำ)", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "YV40",
      created_at: "2026-11-03T07:40:00+07:00",
      transferred_at: "2026-11-03T07:45:46+07:00",
      purchases: [
        { code: "K1", name: "กางเกงขาสั้นเด็ก", quantity: 1 },
        { code: "K2", name: "กางเกงขาสั้นเด็ก", quantity: 2 },
      ],
    }),
  ];

  const summary = buildDayPackingSummary(orders, "2026-11-03");
  assert.equal(summary.products.length, 1);
  assert.equal(summary.products[0].quantity, 3);
  assert.equal(summary.products[0].lines.length, 1);
  assert.equal(summary.products[0].lines[0].quantity, 3);
});

test("สถานะออเดอร์ที่แสดงในหน้า อิงจากฟิลด์ของ Shipnity", () => {
  assert.equal(describeOrderStatus(rawOrder({ paid: false, transferred_at: null })), "ยังไม่ชำระเงิน");
  assert.equal(
    describeOrderStatus(rawOrder({ paid: false, transferred: true })),
    "แจ้งโอนเงิน · รอตรวจสอบ",
  );
  assert.equal(describeOrderStatus(rawOrder({ paid: true })), "ชำระแล้ว · รอพิมพ์");
  assert.equal(describeOrderStatus(rawOrder({ paid: true, printed: true })), "พิมพ์แล้ว · รอแพ็ค");
  assert.equal(describeOrderStatus(rawOrder({ paid: true, closed: true })), "ส่งของแล้ว");
  assert.equal(
    describeOrderStatus(rawOrder({ paid: true, printed: true, order_bank: "pay_later" })),
    "พิมพ์แล้ว · รอแพ็ค · COD",
  );
});

test("แยกออเดอร์ของวันนี้ออกจากของค้างด้วยเวลาไทย", () => {
  const order = (createdAt: string | null) =>
    ({ created_at: createdAt, items: [], price: 0 }) as unknown as ShipnityOrder;

  // 17:30Z ของวันที่ 10 = 00:30 น. วันที่ 11 ตามเวลาไทย
  assert.equal(isOrderFromDay(order("2026-11-10T17:30:00Z"), "2026-11-11"), true);
  assert.equal(isOrderFromDay(order("2026-11-10T16:30:00Z"), "2026-11-11"), false);
  assert.equal(isOrderFromDay(order("2026-11-03T14:45:52+07:00"), "2026-11-11"), false);
  assert.equal(isOrderFromDay(order(null), "2026-11-11"), false);
});

test("ชิปสถานะแบบ Shipnity: แยกตาม paid/printed/payment_accepted และตัดที่ยกเลิกออก", () => {
  const base = { created_at: "2026-11-11T10:00:00+07:00", items: [], price: 100 } as unknown as ShipnityOrder;
  const counts = countShipnityStatuses([
    { ...base, id: 1, paid: false, transferred: false },
    { ...base, id: 2, paid: false, transferred: true },
    { ...base, id: 3, paid: true, payment_accepted: false },
    { ...base, id: 4, paid: true, payment_accepted: true, printed: false },
    { ...base, id: 5, paid: true, payment_accepted: true, printed: true },
    { ...base, id: 6, paid: false, cancelled: true },
    { ...base, id: 7, paid: true, printed: true, closed: true },
  ]);

  assert.deepEqual(counts, { total: 5, unpaid: 1, checkSlip: 1, confirmed: 1, toPrint: 1, ready: 1 });
});

test("รวบออเดอร์ค้างจ่าย พร้อมสถานะและจำนวนวันค้าง", () => {
  const orders: ShipnityOrder[] = [
    rawOrder({
      id: 1,
      invoice_number: "U1",
      paid: false,
      transferred_at: null,
      created_at: "2026-11-11T08:00:00+07:00",
    }),
    rawOrder({
      id: 2,
      invoice_number: "U2",
      paid: false,
      transferred: true,
      transferred_at: "2026-11-11T09:00:00+07:00",
      created_at: "2026-11-11T08:30:00+07:00",
    }),
    rawOrder({ id: 3, invoice_number: "P1", paid: true }),
  ];

  const rows = collectWaitingPaymentOrders(orders, "2026-11-11");
  assert.deepEqual(
    rows.map((row) => [row.orderCode, row.status]),
    [
      ["U1", "ยังไม่ชำระเงิน"],
      ["U2", "แจ้งโอนเงิน · รอตรวจสอบ"],
    ],
  );
  assert.equal(rows[0].daysPending, 0);
});

test("สรุปยอดตามช่องทางของทั้งรอบ", () => {
  const orders = [
    {
      orderCode: "A1",
      customerName: null,
      courier: "J&T",
      marketplace: "Tiktok",
      itemCount: 3,
      items: [],
      totalAmount: 100,
      cutAt: new Date("2026-11-11T02:00:00.000Z"),
      round: "current" as const,
      daysPending: 0,
    },
    {
      orderCode: "A2",
      customerName: null,
      courier: "J&T",
      marketplace: "Tiktok",
      itemCount: 2,
      items: [],
      totalAmount: 100,
      cutAt: new Date("2026-11-11T03:00:00.000Z"),
      round: "current" as const,
      daysPending: 0,
    },
    {
      orderCode: "B1",
      customerName: null,
      courier: "Flash",
      marketplace: "Shopee",
      itemCount: 4,
      items: [],
      totalAmount: 100,
      cutAt: new Date("2026-11-11T04:00:00.000Z"),
      round: "current" as const,
      daysPending: 0,
    },
  ];

  assert.deepEqual(summarizeChannels(orders), [
    { channel: "Tiktok", quantity: 5, orderCount: 2 },
    { channel: "Shopee", quantity: 4, orderCount: 1 },
  ]);
});

test("อ่าน credential จาก env ได้ และคืน null เมื่อไม่มี", () => {
  delete process.env.SHIPNITY_API_TOKEN;
  delete process.env.SHIPNITY_API_EMAIL;
  assert.equal(shipnityCredentialsFromEnv(), null);

  process.env.SHIPNITY_API_TOKEN = "token-ทดสอบ";
  process.env.SHIPNITY_API_EMAIL = "shop@example.com";
  assert.deepEqual(shipnityCredentialsFromEnv(), {
    token: "token-ทดสอบ",
    email: "shop@example.com",
  });

  delete process.env.SHIPNITY_API_TOKEN;
  delete process.env.SHIPNITY_API_EMAIL;
});
