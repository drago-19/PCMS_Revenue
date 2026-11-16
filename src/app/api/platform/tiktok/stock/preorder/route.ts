import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformAccountRow, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ตั้ง/ยกเลิกธง "พรีออเดอร์" ของ SKU ในระบบเรา
 * TikTok ไม่มีฟิลด์นี้ใน API — ธงนี้ใช้ทำป้ายบนออเดอร์และตัวกรองเท่านั้น
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 120) : "";
  const skuId = typeof body.skuId === "string" ? body.skuId.trim().slice(0, 60) : "";
  const value = body.value === true;

  if (!shopId || !skuId) {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }

  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!account) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }

  const updated = await query<{ sku_id: string }>(
    `UPDATE platform_stock SET is_preorder = $3, updated_at = now()
      WHERE platform = $1 AND shop_id = $2 AND sku_id = $4
      RETURNING sku_id`,
    [TIKTOK_PLATFORM, shopId, value, skuId],
  );
  if (updated.length === 0) {
    return Response.json({ error: "ไม่พบ SKU นี้ในร้าน", requestId: auth.requestId }, { status: 404 });
  }

  await recordAuditLog({
    actor: auth.session.sub,
    action: "platform.stock.preorder",
    ipAddress: getClientIp(request),
    outcome: "success",
    details: { shopId, skuId, value },
    requestId: auth.requestId,
  });

  return Response.json({ ok: true, skuId, value, requestId: auth.requestId });
}
