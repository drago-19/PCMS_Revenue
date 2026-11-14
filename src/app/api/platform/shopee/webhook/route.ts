import { createHmac, timingSafeEqual } from "node:crypto";
import { recordAuditLog } from "@/lib/auth";
import { redactShopeeSecret } from "@/lib/platform/shopee";
import { ensureValidShopeeToken, syncShopeeOrdersAndFinance } from "@/lib/platform/shopee-sync";
import { getPlatformConfig, listPlatformAccounts, SHOPEE_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รหัส push ของ Shopee ที่เกี่ยวกับออเดอร์ — ที่เหลือตอบรับแล้วข้ามไป */
const ORDER_PUSH_CODES = new Set([2, 3, 4]);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * รับ push (webhook) จาก Shopee เมื่อสถานะออเดอร์เปลี่ยน
 * Shopee เซ็นใน header `Authorization` = HMAC_SHA256(partner_key, url + "|" + body) แบบ hex
 * (ตาม Push Authorization ในคู่มือ developer-guide/18) — ไม่ใช่ query string
 */
export async function POST(request: Request) {
  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json({ ok: false, error: "shopee_not_configured" }, { status: 400 });
  }

  const raw = await request.text();
  if (raw.length > 64 * 1024) {
    return Response.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  // โทเคนลับใน URL กันคนอื่นยิงเข้ามาเล่น — คำนวณจาก partner key ที่ทั้งสองฝั่งมี
  const partnerKey = config.shopee.partnerKey;
  const expectedToken = createHmac("sha256", partnerKey).update("shopee-push").digest("hex").slice(0, 32);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const tokenOk = token.length > 0 && safeEqual(expectedToken, token);
  const authorization = (request.headers.get("authorization") ?? "").trim();

  // หลัง reverse proxy ค่า request.url อาจเป็น http:// หรือใช้ host ภายใน
  // จึงลองทุกรูปแบบของ URL ที่ Shopee ใช้คำนวณ แล้วยอมรับถ้าตัวใดตัวหนึ่งตรง
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const { pathname, search } = new URL(request.url);
  const candidates = new Set<string>([
    request.url,
    request.url.replace(/^http:/, "https:"),
    `${proto}://${forwardedHost}${pathname}${search}`,
    `https://${forwardedHost}${pathname}${search}`,
  ]);

  const matched =
    tokenOk ||
    (authorization
      ? [...candidates].some((base) =>
          safeEqual(createHmac("sha256", partnerKey).update(`${base}|${raw}`).digest("hex"), authorization),
        )
      : false);

  if (!matched) {
    // บันทึกไว้เพื่อวินิจฉัย: Shopee ใช้ URL ใดในการเซ็น และส่ง header อะไรมา
    await recordAuditLog({
      actor: "shopee-push",
      action: "platform.shopee.push_rejected",
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: {
        auth: authorization,
        body: raw.slice(0, 2048),
        candidates: [...candidates],
        proto,
        host: forwardedHost,
      },
      requestId: `push-reject-${Date.now()}`,
    });
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let body: { shop_id?: number | string; code?: number; timestamp?: number } = {};
  try {
    if (raw.trim().length > 0) {
      body = JSON.parse(raw) as typeof body;
    }
  } catch {
    body = {};
  }

  const shopId = String(body.shop_id ?? "").trim();
  const code = Number(body.code ?? 0);

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const account = accounts.find((row) => row.accountKey === shopId);
  if (!account) {
    return Response.json({ ok: true, ignored: "unknown_shop" }, { status: 200 });
  }

  if (!ORDER_PUSH_CODES.has(code)) {
    return Response.json({ ok: true, ignored: `code_${code}` }, { status: 200 });
  }

  try {
    const ctx = await ensureValidShopeeToken(account.accountKey, config.shopee);
    const now = Math.floor(Date.now() / 1000);
    // ดึงย้อน 60 นาที เพราะ push อาจมาช้ากว่าหรือมาหลายครั้งติดกัน
    const result = await syncShopeeOrdersAndFinance(ctx, {
      fromUnix: now - 3600,
      toUnix: now,
      timeRangeField: "update_time",
    });

    await recordAuditLog({
      actor: "shopee-push",
      action: "platform.shopee.push",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { code, shopId, orders: result.orders, finance: result.orderFinance },
      requestId: `push-${String(body.timestamp ?? now)}-${shopId}`,
    });

    return Response.json({ ok: true, code, orders: result.orders }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ประมวลผล push ไม่สำเร็จ";
    await recordAuditLog({
      actor: "shopee-push",
      action: "platform.shopee.push",
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: { code, shopId, message: redactShopeeSecret(message, config.shopee.partnerKey) },
      requestId: `push-${String(body.timestamp ?? Math.floor(Date.now() / 1000))}-${shopId}`,
    });
    return Response.json({ ok: true, processed: false }, { status: 200 });
  }
}
