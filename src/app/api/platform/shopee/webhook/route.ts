import { createHmac, timingSafeEqual } from "node:crypto";
import { recordAuditLog } from "@/lib/auth";
import { redactShopeeSecret, shopeeNowSeconds } from "@/lib/platform/shopee";
import { ensureValidShopeeToken, syncShopeeOrdersAndFinance } from "@/lib/platform/shopee-sync";
import { getPlatformConfig, listPlatformAccounts, SHOPEE_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รหัส push ของ Shopee ที่เกี่ยวกับออเดอร์ — ที่เหลือตอบรับแล้วข้ามไป */
const ORDER_PUSH_CODES = new Set([2, 3, 4]);
/** ยอมรับ timestamp ที่ต่างจากนาฬิกาเราไม่เกิน 10 นาที (กัน replay) */
const MAX_SKEW_SECONDS = 600;
const PATH = "/api/platform/shopee/webhook";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * รับ push (webhook) จาก Shopee เมื่อสถานะออเดอร์เปลี่ยน
 * ลายเซ็น: HMAC_SHA256(partner_key, partner_id + path + timestamp) ส่งมาใน query string
 * ตอบ 200 เสมอหลังลายเซ็นผ่าน เพื่อไม่ให้ Shopee ยิงซ้ำโดยไม่จำเป็น
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partner_id") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const sign = url.searchParams.get("sign") ?? "";

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json({ ok: false, error: "shopee_not_configured" }, { status: 400 });
  }

  if (partnerId !== String(config.shopee.partnerId)) {
    return Response.json({ ok: false, error: "bad_partner" }, { status: 401 });
  }

  const expected = createHmac("sha256", config.shopee.partnerKey)
    .update(`${partnerId}${PATH}${timestamp}`)
    .digest("hex");
  if (!sign || !safeEqual(expected, sign)) {
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt) || Math.abs(shopeeNowSeconds() - sentAt) > MAX_SKEW_SECONDS) {
    return Response.json({ ok: false, error: "stale_timestamp" }, { status: 401 });
  }

  let body: { shop_id?: number | string; code?: number; timestamp?: number } = {};
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) {
      return Response.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "bad_body" }, { status: 400 });
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
    const now = shopeeNowSeconds();
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
      requestId: `push-${timestamp}-${shopId}`,
    });

    return Response.json({ ok: true, code, orders: result.orders }, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "ประมวลผล push ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await recordAuditLog({
      actor: "shopee-push",
      action: "platform.shopee.push",
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: { code, shopId, message },
      requestId: `push-${timestamp}-${shopId}`,
    });
    return Response.json({ ok: true, processed: false, error: message }, { status: 200 });
  }
}
