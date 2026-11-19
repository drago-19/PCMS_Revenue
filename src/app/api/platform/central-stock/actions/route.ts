import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { getClientIp } from "@/lib/session-token";
import {
  archiveCentralStock,
  renameCentralStockCode,
  restoreCentralStock,
  setCentralStockImage,
} from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * คำสั่งจัดการรหัสกลางที่แยกไฟล์มาเพื่อไม่ให้ติดแคชของ route รวมเดิม
 * action: archive | restore | rename-code | image
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const action = typeof body.action === "string" ? body.action.slice(0, 20) : "";
  const skuCode = typeof body.skuCode === "string" ? body.skuCode.trim().slice(0, 120) : "";
  const path = "/api/platform/central-stock/actions";

  if (!skuCode) {
    return Response.json(
      { error: "ต้องระบุรหัสสินค้า", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    if (action === "archive" || action === "restore") {
      const result =
        action === "archive"
          ? await archiveCentralStock({ skuCode, actor: auth.session.sub })
          : (await restoreCentralStock({ skuCode, actor: auth.session.sub }), { unlinked: 0 });
      await recordAuditLog({
        actor: auth.session.sub,
        action: action === "archive" ? "platform.central_stock.archive" : "platform.central_stock.restore",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { skuCode, ...result, via: path },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, ...result, requestId: auth.requestId });
    }

    if (action === "rename-code") {
      const newSkuCode = typeof body.newSkuCode === "string" ? body.newSkuCode.trim().slice(0, 120) : "";
      if (!newSkuCode) {
        return Response.json(
          { error: "ต้องระบุรหัสใหม่", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const renamed = await renameCentralStockCode({ from: skuCode, to: newSkuCode, actor: auth.session.sub });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.rename_code",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { ...renamed, via: path },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, ...renamed, requestId: auth.requestId });
    }

    if (action === "image") {
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) {
        return Response.json(
          { error: "ไฟล์รูปต้องเป็น JPG/PNG/WEBP", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      await setCentralStockImage({ skuCode, contentType: match[1], buffer: Buffer.from(match[2], "base64") });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.image",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { skuCode, contentType: match[1], via: path },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, requestId: auth.requestId });
    }

    return Response.json(
      { error: "ไม่รู้จักคำสั่งที่ขอ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}
