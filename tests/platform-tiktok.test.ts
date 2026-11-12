import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildAuthorizeUrl,
  listStatements,
  redactSecret,
  signRequest,
  TikTokApiError,
  type TikTokAppConfig,
} from "../src/lib/platform/tiktok";

const CONFIG: TikTokAppConfig = {
  appKey: "test-app-key",
  appSecret: "test-app-secret-value",
  serviceId: "test-service-id",
};

function expectedSign({
  path,
  query,
  body,
  secret,
}: {
  path: string;
  query: Record<string, string>;
  body?: string;
  secret: string;
}): string {
  const keys = Object.keys(query)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort();
  let input = path;
  for (const key of keys) input += key + query[key];
  if (body) input += body;
  return createHmac("sha256", secret)
    .update(secret + input + secret)
    .digest("hex");
}

test("signRequest: ตรงกับสูตรของ TikTok (เรียง key + ครอบ secret สองข้าง)", () => {
  const query = { app_key: "k", shop_cipher: "C1", timestamp: "1700000000" };
  const sign = signRequest({ path: "/finance/202309/statements", query, appSecret: "s3cret" });
  assert.equal(sign, expectedSign({ path: "/finance/202309/statements", query, secret: "s3cret" }));
  assert.match(sign, /^[0-9a-f]{64}$/);
});

test("signRequest: ลำดับการใส่ query ไม่มีผล (เรียงตาม key ก่อนเซ็น)", () => {
  const a = signRequest({
    path: "/order/202309/orders/search",
    query: { app_key: "k", timestamp: "1", page_size: "20" },
    appSecret: "s",
  });
  const b = signRequest({
    path: "/order/202309/orders/search",
    query: { page_size: "20", timestamp: "1", app_key: "k" },
    appSecret: "s",
  });
  assert.equal(a, b);
});

test("signRequest: ตัด sign และ access_token ออกจากฐานการเซ็น", () => {
  const base = signRequest({
    path: "/authorization/202309/shops",
    query: { app_key: "k", timestamp: "1" },
    appSecret: "s",
  });
  const withExtras = signRequest({
    path: "/authorization/202309/shops",
    query: { app_key: "k", timestamp: "1", sign: "x", access_token: "y" },
    appSecret: "s",
  });
  assert.equal(base, withExtras);
});

test("signRequest: body มีผลกับลายเซ็น (POST)", () => {
  const params = { path: "/order/202309/orders/search", query: { app_key: "k" }, appSecret: "s" };
  const withoutBody = signRequest(params);
  const withBody = signRequest({ ...params, body: '{"page_size":20}' });
  assert.notEqual(withoutBody, withBody);
});

test("buildAuthorizeUrl: ใส่ service_id และ state ลงในลิงก์ authorize ของ TikTok", () => {
  const url = new URL(buildAuthorizeUrl(CONFIG, "state-123"));
  assert.equal(url.origin, "https://services.tiktokshop.com");
  assert.equal(url.pathname, "/open/authorize");
  assert.equal(url.searchParams.get("service_id"), CONFIG.serviceId);
  assert.equal(url.searchParams.get("state"), "state-123");
});

test("listStatements: ส่ง shop_cipher + x-tts-access-token และแปลงผลลัพธ์เป็นรูปแบบที่ใช้ต่อ", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(
      JSON.stringify({
        code: 0,
        message: "Success",
        data: {
          statements: [
            {
              id: "7238804564097517339",
              statement_time: 1685548800,
              settlement_amount: "-120.50",
              currency: "THB",
              payment_status: "PAID",
              adjustment_amount: "-70",
              revenue_amount: "200",
              fee_amount: "-30",
            },
          ],
          next_page_token: "next-token",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await listStatements({
      config: CONFIG,
      accessToken: "access-1",
      shopCipher: "CIPHER-1",
      fromUnix: 1_700_000_000,
      toUnix: 1_800_000_000,
      pageSize: 5,
    });

    assert.equal(calls.length, 1);
    const called = new URL(calls[0].url);
    assert.equal(called.pathname, "/finance/202309/statements");
    assert.equal(called.searchParams.get("shop_cipher"), "CIPHER-1");
    assert.equal(called.searchParams.get("page_size"), "5");
    assert.equal(called.searchParams.get("statement_time_ge"), "1700000000");
    assert.equal(called.searchParams.get("app_key"), CONFIG.appKey);
    assert.ok(called.searchParams.get("sign"));
    assert.equal(calls[0].headers["x-tts-access-token"], "access-1");

    assert.equal(result.statements.length, 1);
    // ยอดติดลบต้องคงเครื่องหมายตามไฟล์/API ห้ามแปลงเป็นบวก
    assert.equal(result.statements[0].settlementAmount, "-120.50");
    assert.equal(result.statements[0].paymentStatus, "PAID");
    assert.equal(result.nextPageToken, "next-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redactSecret: ตัด app_secret / auth_code / refresh_token ออกจากข้อความ error", () => {
  const message =
    "request to https://auth.tiktok-shops.com/api/v2/token/get?app_key=k&app_secret=SUPERSECRET&auth_code=abc123 failed";
  const out = redactSecret(message, "SUPERSECRET");
  assert.ok(!out.includes("SUPERSECRET"));
  assert.ok(!out.includes("abc123"));
  assert.match(out, /app_secret=\[redacted\]/);
});

test("callTikTokApi: envelope ที่ code ไม่ใช่ 0 ต้องโยน TikTokApiError พร้อมข้อความของ TikTok", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 36009002,
        message: "too many requests",
        request_id: "req-1",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        listStatements({
          config: CONFIG,
          accessToken: "access-1",
          shopCipher: "CIPHER-1",
          pageSize: 1,
        }),
      (err: unknown) => {
        assert.ok(err instanceof TikTokApiError);
        assert.equal(err.code, 36009002);
        assert.equal(err.requestId, "req-1");
        assert.match(err.message, /too many requests/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
