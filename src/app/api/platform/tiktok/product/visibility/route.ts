import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { setProductVisibility, StockWriteError } from "@/lib/platform/stock-write";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เปิด/ซ่อนตะกร้าของสินค้าที่ TikTok — ใช้ด่านเดียวกับปรับสต็อก (ร้านทดสอบก่อน) */
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
  const { visible } = body;
  const auditAction = visible === true ? "platform.tiktok.product.activate" : "platform.tiktok.product.deactivate";

  if (!shopId || !productId || typeof visible !== "boolean") {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }

  try {
    const result = await setProductVisibility({ shopId, productId, visible });
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, visible, ...result },
      requestId: auth.requestId,
    });
    return Response.json({ ok: true, ...result, requestId: auth.requestId });
  } catch (error) {
    if (error instanceof StockWriteError) {
      const status =
        error.code === "conflict" ? 409 : error.code === "not_allowed" ? 403 : error.code === "not_found" ? 404 : 422;
      await recordAuditLog({
        actor: auth.session.sub,
        action: auditAction,
        ipAddress: getClientIp(request),
        outcome: "failure",
        details: { shopId, productId, visible, code: error.code, error: error.message },
        requestId: auth.requestId,
      });
      return Response.json(
        { error: error.message, code: error.code, requestId: auth.requestId },
        { status },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, requestId: auth.requestId }, { status: 500 });
  }
}
