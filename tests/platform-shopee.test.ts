import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  addShopeeItem,
  buildShopeeAuthorizeUrl,
  exchangeShopeeAuthCode,
  getShopeeEscrowDetail,
  getShopeeOrderDetails,
  getShopeeShopInfo,
  listShopeeInventory,
  listShopeeOrderSns,
  normalizeShopeeOrderStatus,
  parseShopeeCallbackInput,
  redactShopeeSecret,
  refreshShopeeAccessToken,
  resetShopeeClockOffset,
  SHOPEE_HOSTS,
  ShopeeApiError,
  shopeeNowSeconds,
  signShopeePublicRequest,
  signShopeeShopRequest,
  deleteShopeeItem,
  setShopeeStock,
  unlistShopeeItem,
  updateShopeeStock,
  type ShopeeAppConfig,
} from "../src/lib/platform/shopee";

process.env.SHOPEE_MIN_INTERVAL_MS = "0";
process.env.SHOPEE_RETRY_BASE_MS = "1";

const SANDBOX_CONFIG: ShopeeAppConfig = {
  partnerId: "1253520",
  partnerKey: "shpk-test-partner-key-secret-1234567890",
  env: "sandbox",
  redirectBaseUrl: "https://revenue.goldpulse-ai.com",
};

const LIVE_CONFIG: ShopeeAppConfig = {
  ...SANDBOX_CONFIG,
  env: "live",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

test("signShopeePublicRequest: ตรงสเปก HMAC-SHA256(partner_id + path + timestamp)", () => {
  const sign = signShopeePublicRequest({
    partnerId: "1253520",
    path: "/api/v2/shop/auth_partner",
    timestamp: "1700000000",
    partnerKey: "secret-key",
  });
  const expected = createHmac("sha256", "secret-key")
    .update("1253520/api/v2/shop/auth_partner1700000000")
    .digest("hex");
  assert.equal(sign, expected);
  assert.match(sign, /^[0-9a-f]{64}$/);
});

test("signShopeeShopRequest: รวม access_token และ shop_id เข้าฐานการเซ็น", () => {
  const sign = signShopeeShopRequest({
    partnerId: "1253520",
    path: "/api/v2/order/get_order_list",
    timestamp: "1700000000",
    accessToken: "atk_123",
    shopId: "998877",
    partnerKey: "secret-key",
  });
  const expected = createHmac("sha256", "secret-key")
    .update("1253520/api/v2/order/get_order_list1700000000atk_123998877")
    .digest("hex");
  assert.equal(sign, expected);
});

test("buildShopeeAuthorizeUrl: เลือก host sandbox vs live และเซ็นพารามิเตอร์ครบ", () => {
  resetShopeeClockOffset();
  const redirect = "https://revenue.goldpulse-ai.com/api/platform/shopee/callback";
  const sandboxUrl = new URL(buildShopeeAuthorizeUrl(SANDBOX_CONFIG, redirect));
  assert.equal(sandboxUrl.origin, SHOPEE_HOSTS.sandbox);
  assert.equal(sandboxUrl.pathname, "/api/v2/shop/auth_partner");
  assert.equal(sandboxUrl.searchParams.get("partner_id"), "1253520");
  assert.equal(sandboxUrl.searchParams.get("redirect"), redirect);
  const ts = sandboxUrl.searchParams.get("timestamp") ?? "";
  assert.equal(
    sandboxUrl.searchParams.get("sign"),
    signShopeePublicRequest({
      partnerId: SANDBOX_CONFIG.partnerId,
      path: "/api/v2/shop/auth_partner",
      timestamp: ts,
      partnerKey: SANDBOX_CONFIG.partnerKey,
    }),
  );

  const liveUrl = new URL(buildShopeeAuthorizeUrl(LIVE_CONFIG, redirect));
  assert.equal(liveUrl.origin, SHOPEE_HOSTS.live);
});

test("parseShopeeCallbackInput: แยก code + shop_id ทั้งแบบ Callback URL และแบบกรอกตรง", () => {
  const fromUrl = parseShopeeCallbackInput({
    callbackUrl:
      "https://revenue.goldpulse-ai.com/api/platform/shopee/callback?code=AUTH_CODE_99&shop_id=22556677",
  });
  assert.deepEqual(fromUrl, { code: "AUTH_CODE_99", shopId: "22556677" });

  const fromManual = parseShopeeCallbackInput({ code: " C1 ", shopId: " 12345 " });
  assert.deepEqual(fromManual, { code: "C1", shopId: "12345" });

  assert.throws(
    () => parseShopeeCallbackInput({ callbackUrl: "https://example.com/no-code" }),
    ShopeeApiError,
  );
  assert.throws(
    () => parseShopeeCallbackInput({ code: "abc", shopId: "not-a-number" }),
    ShopeeApiError,
  );
});

test("normalizeShopeeOrderStatus: แปลงสถานะ Shopee เป็นมาตรฐานเดียวกับ /platform", () => {
  assert.equal(normalizeShopeeOrderStatus("READY_TO_SHIP"), "AWAITING_SHIPMENT");
  assert.equal(normalizeShopeeOrderStatus("PROCESSED"), "AWAITING_SHIPMENT");
  assert.equal(normalizeShopeeOrderStatus("SHIPPED"), "IN_TRANSIT");
  assert.equal(normalizeShopeeOrderStatus("TO_CONFIRM_RECEIVE"), "DELIVERED");
  assert.equal(normalizeShopeeOrderStatus("COMPLETED"), "COMPLETED");
  assert.equal(normalizeShopeeOrderStatus("CANCELLED"), "CANCELLED");
  assert.equal(normalizeShopeeOrderStatus("UNPAID"), "UNPAID");
});

test("redactShopeeSecret: ลบ partnerKey, tokens และ signature ออกจากข้อความ error", () => {
  const raw = `fail with ${SANDBOX_CONFIG.partnerKey} access_token=atk99 refresh_token=rtk88 sign=abcdef0123 code=xyz`;
  const clean = redactShopeeSecret(raw, SANDBOX_CONFIG.partnerKey);
  assert.ok(!clean.includes(SANDBOX_CONFIG.partnerKey));
  assert.ok(!clean.includes("atk99"));
  assert.ok(!clean.includes("rtk88"));
  assert.ok(!clean.includes("abcdef0123"));
  assert.ok(!clean.includes("code=xyz"));
});

test("exchangeShopeeAuthCode & refreshShopeeAccessToken: ส่ง partner_id/shop_id แบบ integer", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body: parsedBody });
    if (url.includes("/api/v2/auth/token/get")) {
      return jsonResponse({
        access_token: "atk_init",
        refresh_token: "rtk_init",
        expire_in: 14400,
        shop_id: 22556677,
      });
    }
    return jsonResponse({
      access_token: "atk_rotated",
      refresh_token: "rtk_rotated",
      expire_in: 14400,
      shop_id: 22556677,
    });
  };

  try {
    const token = await exchangeShopeeAuthCode(SANDBOX_CONFIG, {
      code: "CODE_1",
      shopId: "22556677",
    });
    assert.equal(token.accessToken, "atk_init");
    assert.equal(token.refreshToken, "rtk_init");
    assert.equal(token.shopId, "22556677");
    assert.equal(calls[0].body.partner_id, 1253520);
    assert.equal(calls[0].body.shop_id, 22556677);

    const refreshed = await refreshShopeeAccessToken(SANDBOX_CONFIG, {
      refreshToken: "rtk_init",
      shopId: "22556677",
    });
    assert.equal(refreshed.accessToken, "atk_rotated");
    assert.equal(refreshed.refreshToken, "rtk_rotated");
    assert.equal(calls[1].body.refresh_token, "rtk_init");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listShopeeOrderSns: แบ่งช่วงละไม่เกิน 15 วันอัตโนมัติ + รองรับ cursor pagination", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  const windows: Array<{ from: number; to: number; cursor: string }> = [];

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const from = Number(url.searchParams.get("time_from"));
    const to = Number(url.searchParams.get("time_to"));
    const cursor = url.searchParams.get("cursor") ?? "";
    windows.push({ from, to, cursor });

    if (windows.length === 1) {
      return jsonResponse({
        response: {
          more: true,
          next_cursor: "c2",
          order_list: [{ order_sn: "SP_ORDER_1" }, { order_sn: "SP_ORDER_2" }],
        },
      });
    }
    if (cursor === "c2") {
      return jsonResponse({
        response: {
          more: false,
          order_list: [{ order_sn: "SP_ORDER_2" }, { order_sn: "SP_ORDER_3" }],
        },
      });
    }
    return jsonResponse({
      response: {
        more: false,
        order_list: [{ order_sn: "SP_ORDER_4" }],
      },
    });
  };

  try {
    const start = 1_700_000_000;
    const end = start + 20 * 86_400; // 20 วัน -> ต้องถูกแบ่งเป็น 2 ช่วง (15 วัน + 5 วัน)
    const sns = await listShopeeOrderSns(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      timeFrom: start,
      timeTo: end,
    });

    assert.deepEqual(sns, ["SP_ORDER_1", "SP_ORDER_2", "SP_ORDER_3", "SP_ORDER_4"]);
    assert.equal(windows.length, 3);
    assert.equal(windows[0].to - windows[0].from, 15 * 86_400);
    assert.equal(windows[2].to - windows[2].from, 5 * 86_400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getShopeeShopInfo, getShopeeOrderDetails & getShopeeEscrowDetail: แปลงข้อมูลตรงสเปก", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (url.pathname.endsWith("/get_shop_info")) {
      return jsonResponse({ shop_name: "Sandbox Local Shop TH", region: "TH", status: "NORMAL" });
    }
    if (url.pathname.endsWith("/get_order_detail")) {
      return jsonResponse({
        response: {
          order_list: [
            {
              order_sn: "261114ABC",
              order_status: "READY_TO_SHIP",
              create_time: 1_700_000_100,
              pay_time: 1_700_000_120,
              update_time: 1_700_000_150,
              currency: "THB",
              total_amount: 590,
              buyer_user_id: 7788,
              recipient_address: {
                name: "สมชาย",
                phone: "0812345678",
                state: "กรุงเทพมหานคร",
                district: "วัฒนา",
                zipcode: "10110",
              },
              package_list: [{ tracking_number: "TH012345", shipping_carrier: "SPX Express" }],
              item_list: [
                {
                  item_id: 1001,
                  model_id: 2001,
                  model_sku: "SKU-BLACK-M",
                  item_name: "เสื้อยืด",
                  model_name: "ดำ M",
                  model_quantity_purchased: 2,
                  model_discounted_price: 295,
                  image_info: { image_url: "https://cf.shopee.co.th/img.jpg" },
                },
              ],
            },
          ],
        },
      });
    }
    return jsonResponse({
      response: {
        order_sn: "261114ABC",
        order_income: {
          currency: "THB",
          escrow_amount: 530.5,
          order_discounted_price: 590,
          commission_fee: 35,
          service_fee: 15.5,
          seller_transaction_fee: 9,
          actual_shipping_fee: 38,
          reverse_shipping_fee: 0,
        },
      },
    });
  };

  try {
    const shop = await getShopeeShopInfo(SANDBOX_CONFIG, { accessToken: "atk", shopId: "22556677" });
    assert.equal(shop.shopName, "Sandbox Local Shop TH");
    assert.equal(shop.region, "TH");

    const orders = await getShopeeOrderDetails(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      orderSns: ["261114ABC"],
    });
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, "AWAITING_SHIPMENT");
    assert.equal(orders[0].province, "กรุงเทพมหานคร");
    assert.equal(orders[0].items[0].skuId, "SKU-BLACK-M");
    assert.equal(orders[0].items[0].quantity, 2);

    const escrow = await getShopeeEscrowDetail(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      orderSn: "261114ABC",
    });
    assert.ok(escrow);
    assert.equal(escrow.settlementAmount, 530.5);
    assert.equal(escrow.revenueAmount, 590);
    assert.equal(escrow.feeAndTaxAmount, -59.5);
    assert.equal(escrow.shippingCostAmount, -38);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listShopeeInventory & updateShopeeStock: รองรับทั้งสินค้าเดี่ยวและสินค้ามีตัวเลือก", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  const updateBodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (url.pathname.endsWith("/get_item_list")) {
      return jsonResponse({
        response: { item: [{ item_id: 101 }, { item_id: 102 }], has_next_page: false },
      });
    }
    if (url.pathname.endsWith("/get_item_base_info")) {
      return jsonResponse({
        response: {
          item_list: [
            {
              item_id: 101,
              item_name: "กางเกง",
              item_sku: "PANTS",
              has_model: true,
              image: { image_url_list: ["https://cf.shopee.co.th/p.jpg"] },
            },
            {
              item_id: 102,
              item_name: "หมวก",
              item_sku: "HAT-01",
              has_model: false,
              stock_info_v2: {
                seller_stock: [{ location_id: "TH01", stock: 12 }],
              },
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/get_model_list")) {
      return jsonResponse({
        response: {
          model: [
            {
              model_id: 9001,
              model_sku: "PANTS-L",
              model_name: "L",
              stock_info_v2: { summary_info: { total_available_stock: 7 } },
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/update_stock")) {
      updateBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return jsonResponse({ response: { success_list: [{ model_id: 0 }], failure_list: [] } });
    }
    return jsonResponse({ response: {} });
  };

  try {
    const items = await listShopeeInventory(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
    });
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
      skuId: "101:9001",
      productId: "101",
      sellerSku: "PANTS-L",
      productName: "กางเกง (L)",
      imageUrl: "https://cf.shopee.co.th/p.jpg",
      quantity: 7,
      warehouses: [],
    });
    assert.equal(items[1].skuId, "102:0");
    assert.equal(items[1].quantity, 12);

    const updated = await updateShopeeStock(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      itemId: 102,
      stockList: [{ seller_stock: [{ location_id: "TH01", stock: 20 }] }],
    });
    assert.equal(updated.successList.length, 1);
    assert.equal(updateBodies[0]?.item_id, 102);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("clock skew: ชดเชย timestamp จาก response header Date แล้วลองซ้ำอัตโนมัติ", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    const futureDate = new Date(Date.now() + 600_000).toUTCString();
    if (attempts === 1) {
      return jsonResponse(
        { error: "error_auth", message: "Invalid timestamp" },
        { status: 403, headers: { date: futureDate } },
      );
    }
    return jsonResponse({ shop_name: "Recovered Shop", region: "TH" });
  };

  try {
    const shop = await getShopeeShopInfo(SANDBOX_CONFIG, { accessToken: "atk", shopId: "22556677" });
    assert.equal(shop.shopName, "Recovered Shop");
    assert.equal(attempts, 2);
    assert.ok(shopeeNowSeconds() > Math.floor(Date.now() / 1000) + 500);
  } finally {
    resetShopeeClockOffset();
    globalThis.fetch = originalFetch;
  }
});

test("setShopeeStock / unlistShopeeItem / deleteShopeeItem: ยิง path และ body ตรงสเปก", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ path: url.pathname, body });
    if (url.pathname.endsWith("/update_stock")) {
      return jsonResponse({ response: { success_list: [{ model_id: 0 }], failure_list: [] } });
    }
    if (url.pathname.endsWith("/unlist_item")) {
      return jsonResponse({ response: { success_list: [{ item_id: 102 }], failure_list: [] } });
    }
    return jsonResponse({ response: {} });
  };

  try {
    await setShopeeStock(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      itemId: 102,
      quantity: 15,
    });
    assert.equal(calls[0].path, "/api/v2/product/update_stock");
    assert.equal(calls[0].body.item_id, 102);
    const stockList = calls[0].body.stock_list as Array<Record<string, unknown>>;
    assert.deepEqual(stockList[0].seller_stock, [{ stock: 15 }]);
    assert.equal(stockList[0].model_id, undefined);

    const unlisted = await unlistShopeeItem(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      itemId: 102,
    });
    assert.equal(unlisted.successList.length, 1);
    assert.equal(calls[1].path, "/api/v2/product/unlist_item");
    assert.deepEqual(calls[1].body.item_list, [{ item_id: 102, unlist: true }]);

    await deleteShopeeItem(SANDBOX_CONFIG, { accessToken: "atk", shopId: "22556677", itemId: 102 });
    assert.equal(calls[2].path, "/api/v2/product/delete_item");
    assert.equal(calls[2].body.item_id, 102);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("addShopeeItem: ส่ง brand, image_id_list, seller_stock และ logistics ครบตามที่ Shopee บังคับ", async () => {
  resetShopeeClockOffset();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ path: url.pathname, body });
    return jsonResponse({ response: { item_id: 803953054 } });
  };

  try {
    const created = await addShopeeItem(SANDBOX_CONFIG, {
      accessToken: "atk",
      shopId: "22556677",
      itemName: "แก้วทดสอบ",
      description: "รายละเอียดสินค้าทดสอบที่ยาวพอสำหรับ Shopee อย่างน้อยหกสิบตัวอักษรตามที่กำหนด",
      price: 159,
      stock: 30,
      weightKg: 0.25,
      categoryId: 400358,
      imageId: "img_123",
      logisticIds: [71001, 71002],
    });

    assert.equal(created.itemId, 803953054);
    assert.equal(calls[0].path, "/api/v2/product/add_item");
    assert.deepEqual(calls[0].body.brand, { brand_id: 0, original_brand_name: "No Brand" });
    assert.deepEqual(calls[0].body.image, { image_id_list: ["img_123"] });
    assert.deepEqual(calls[0].body.seller_stock, [{ stock: 30 }]);
    assert.equal(calls[0].body.category_id, 400358);
    assert.equal((calls[0].body.logistic_info as unknown[]).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
