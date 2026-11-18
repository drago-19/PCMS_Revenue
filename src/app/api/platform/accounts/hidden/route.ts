import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { setShopHidden } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ซ่อน/แสดงร้านในรายการเลือก — ไม่ตัดการเชื่อมต่อ token และสิทธิ์ยังอยู่ครบ
 * ใช้กับหน้าตั้งค่า: ซ่อนแล้วร้านจะไม่โผล่ในตัวเลือกของหน้าสต็อก แต่ยังเปิดกลับได้ที่นี่
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
  const requestedPlatform = typeof body.platform === "string" ? body.platform.trim() : "";
  // แพลตฟอร์มที่รองรับ — ค่าเริ่มต้นคือ TikTok เพื่อไม่ให้ผู้เรียกเดิมพัง
  const platform = ["TikTok", "Shopee", "Facebook"].includes(requestedPlatform)
    ? requestedPlatform
    : "TikTok";
  const { hidden } = body;
  if (!shopId || typeof hidden !== "boolean") {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }

  try {
    await setShopHidden(platform, shopId, hidden);
    await recordAuditLog({
      actor: auth.session.sub,
      action: hidden ? "platform.shop.hide" : "platform.shop.show",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { platform, shopId, hidden },
      requestId: auth.requestId,
    });
    return Response.json({ ok: true, shopId, hidden, requestId: auth.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, requestId: auth.requestId }, { status: 500 });
  }
}
