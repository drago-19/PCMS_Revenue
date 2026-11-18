import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { updateProductTitle } from "@/lib/platform/product-write";
import { liveWriteAllowed } from "@/lib/platform/stock-write";
import { getPlatformAccountRow, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE = 255;

/**
 * แก้ชื่อสินค้าบน TikTok
 * - ร้านทดสอบทำได้เสมอ · ร้านจริงต้องเปิด PLATFORM_STOCK_WRITE_LIVE=1 (ด่านเดียวกับปรับสต็อก)
 * - บันทึก audit ทุกครั้ง ทั้งสำเร็จและล้มเหลว
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
  const productId = typeof body.productId === "string" ? body.productId.trim().slice(0, 60) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";

  if (!shopId || !productId || title.length < 3) {
    return Response.json({ error: "ข้อมูลไม่ครบ (ชื่อสินค้าอย่างน้อย 3 ตัวอักษร)", requestId: auth.requestId }, { status: 400 });
  }

  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!account) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }
  // ร้านทดสอบทำได้เสมอ ร้านจริงต้องเปิด PLATFORM_STOCK_WRITE_LIVE=1 (ด่านเดียวกับปรับสต็อก)
  if (!isSandboxShopName(account.shopName) && !liveWriteAllowed()) {
    return Response.json(
      { error: "ร้านจริงยังไม่เปิดให้แก้สินค้า — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน", requestId: auth.requestId },
      { status: 403 },
    );
  }

  const auditAction = "platform.tiktok.product.update";

  try {
    await updateProductTitle({ shopId, productId, title });
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, productId, title },
      requestId: auth.requestId,
    });
    return Response.json({ ok: true, title, requestId: auth.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: { shopId, productId, title, error: message },
      requestId: auth.requestId,
    });
    return Response.json({ error: message, requestId: auth.requestId }, { status: 422 });
  }
}
