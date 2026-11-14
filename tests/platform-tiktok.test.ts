import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildAuthorizeUrl,
  listStatements,
  redactSecret,
  resetTikTokClockOffset,
  signRequest,
  TikTokApiError,
  tikTokNowSeconds,
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

test("listStatements: เจอ 429 แล้วถอยและลองใหม่จนสำเร็จ (ไม่โยน error ทิ้ง)", async () => {
  const previousInterval = process.env.TIKTOK_MIN_INTERVAL_MS;
  const previousRetry = process.env.TIKTOK_RETRY_BASE_MS;
  process.env.TIKTOK_MIN_INTERVAL_MS = "0";
  process.env.TIKTOK_RETRY_BASE_MS = "1";

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("too many requests", {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }
    return new Response(
      JSON.stringify({ code: 0, message: "Success", data: { statements: [], next_page_token: "" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await listStatements({
      config: CONFIG,
      accessToken: "access-1",
      shopCipher: "CIPHER-1",
      pageSize: 1,
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.statements, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousInterval === undefined) delete process.env.TIKTOK_MIN_INTERVAL_MS;
    else process.env.TIKTOK_MIN_INTERVAL_MS = previousInterval;
    if (previousRetry === undefined) delete process.env.TIKTOK_RETRY_BASE_MS;
    else process.env.TIKTOK_RETRY_BASE_MS = previousRetry;
  }
});

test("callTikTokApi: envelope ที่ code ไม่ใช่ 0 ต้องโยน TikTokApiError พร้อมข้อความของ TikTok", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 105001,
        message: "invalid parameter",
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
        assert.equal(err.code, 105001);
        assert.equal(err.requestId, "req-1");
        assert.match(err.message, /invalid parameter/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callTikTokApi: เจอ Invalid timestamp แล้วชดเชยเวลาจาก Date header และเซ็นใหม่จนสำเร็จ", async () => {
  const previousInterval = process.env.TIKTOK_MIN_INTERVAL_MS;
  process.env.TIKTOK_MIN_INTERVAL_MS = "0";
  resetTikTokClockOffset();

  // จำลองว่าเวลาเซิร์ฟเวอร์ TikTok ช้ากว่าเวลาเครื่องปัจจุบัน 1 ชั่วโมง (3,600 วินาที)
  const serverSec = Math.floor(Date.now() / 1000) - 3600;
  const serverDateHeader = new Date(serverSec * 1000).toUTCString();
  const seenTimestamps: number[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const called = new URL(String(input));
    const ts = Number(called.searchParams.get("timestamp"));
    seenTimestamps.push(ts);

    // ตรวจ sign ด้วยว่าเซ็นด้วย timestamp ที่ส่งมาจริง
    const queryForSign: Record<string, string> = {};
    called.searchParams.forEach((value, key) => {
      if (key !== "sign") queryForSign[key] = value;
    });
    const recomputedSign = expectedSign({
      path: called.pathname,
      query: queryForSign,
      secret: CONFIG.appSecret,
    });
    assert.equal(called.searchParams.get("sign"), recomputedSign);

    if (Math.abs(ts - serverSec) > 30) {
      return new Response(
        JSON.stringify({
          code: 105003,
          message:
            "Invalid timestamp. The value of the 'timestamp' query parameter must not exceed the current time by more than 30 seconds.",
          request_id: "req-ts-1",
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            date: serverDateHeader,
          },
        },
      );
    }

    return new Response(
      JSON.stringify({ code: 0, message: "Success", data: { statements: [], next_page_token: "" } }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          date: serverDateHeader,
        },
      },
    );
  }) as typeof fetch;

  try {
    const first = await listStatements({
      config: CONFIG,
      accessToken: "access-1",
      shopCipher: "CIPHER-1",
      pageSize: 1,
    });
    assert.deepEqual(first.statements, []);
    assert.equal(seenTimestamps.length, 2, "คำขอแรกต้องลองใหม่ 1 ครั้งหลังชดเชยเวลา");
    assert.ok(Math.abs(seenTimestamps[1] - serverSec) <= 2);

    // คำขอถัดไปต้องใช้ค่าชดเชยเดิมทันทีโดยไม่พลาดรอบแรกอีก
    await listStatements({
      config: CONFIG,
      accessToken: "access-1",
      shopCipher: "CIPHER-1",
      pageSize: 1,
    });
    assert.equal(seenTimestamps.length, 3);
    assert.ok(Math.abs(seenTimestamps[2] - serverSec) <= 2);
    assert.ok(Math.abs(tikTokNowSeconds() - serverSec) <= 2);
  } finally {
    globalThis.fetch = originalFetch;
    resetTikTokClockOffset();
    if (previousInterval === undefined) delete process.env.TIKTOK_MIN_INTERVAL_MS;
    else process.env.TIKTOK_MIN_INTERVAL_MS = previousInterval;
  }
});

test("callTikTokApi: เจอ Invalid timestamp แต่ไม่มี Date header ต้องไม่วนลูปและโยน TikTokApiError", async () => {
  const previousInterval = process.env.TIKTOK_MIN_INTERVAL_MS;
  process.env.TIKTOK_MIN_INTERVAL_MS = "0";
  resetTikTokClockOffset();

  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        code: 105003,
        message: "Invalid timestamp.",
        request_id: "req-ts-no-date",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

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
        assert.equal(err.code, 105003);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetTikTokClockOffset();
    if (previousInterval === undefined) delete process.env.TIKTOK_MIN_INTERVAL_MS;
    else process.env.TIKTOK_MIN_INTERVAL_MS = previousInterval;
  }
});
