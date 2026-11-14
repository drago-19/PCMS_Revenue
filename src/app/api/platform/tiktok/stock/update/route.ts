import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { adjustStock, StockWriteError } from "@/lib/platform/stock-write";
import { openHold, releaseHold } from "@/lib/platform/stock-hold";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ปรับสต็อก ± กับ TikTok (ร้านทดสอบก่อน) — อ่านค่าสดและกันเขียนทับระหว่างขายสด */
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
  const skuId = typeof body.skuId === "string" ? body.skuId.trim().slice(0, 60) : "";
  const action = body.action === "hold" || body.action === "release" ? body.action : "adjust";
  const delta = Number(body.delta);
  const expectedQuantity = Number(body.expectedQuantity);
  const auditAction =
    action === "hold"
      ? "platform.tiktok.stock.hold"
      : action === "release"
        ? "platform.tiktok.stock.release"
        : "platform.tiktok.stock.update";

  if (
    !shopId ||
    !productId ||
    !skuId ||
    !Number.isFinite(expectedQuantity) ||
    (action === "adjust" && !Number.isFinite(delta))
  ) {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }

  try {
    const result =
      action === "hold"
        ? await openHold({ shopId, productId, skuId, expectedQuantity, actor: auth.session.sub })
        : action === "release"
          ? await releaseHold({ shopId, productId, skuId, expectedQuantity })
          : await adjustStock({ shopId, productId, skuId, delta, expectedQuantity });
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, productId, skuId, delta, expectedQuantity, ...result },
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
        details: { shopId, productId, skuId, delta, expectedQuantity, code: error.code, error: error.message },
        requestId: auth.requestId,
      });
      return Response.json(
        { error: error.message, code: error.code, detail: error.detail ?? null, requestId: auth.requestId },
        { status },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, requestId: auth.requestId }, { status: 500 });
  }
}
