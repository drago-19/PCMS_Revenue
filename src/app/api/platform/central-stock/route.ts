import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { getClientIp } from "@/lib/session-token";
import {
  addCentralStock,
  autoLinkShop,
  linkListing,
  lookupSkuForCentral,
  reconcileCentralStock,
  unlinkListing,
} from "@/lib/stock/central";
import { pushPoolToListings } from "@/lib/stock/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUANTITY = 1_000_000;
const LISTING_PLATFORMS = new Set(["TikTok", "Shopee"]);

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** ค้นรหัสกลางหนึ่งตัวเพื่อโชว์รูปและจำนวนบนร้านก่อนกดรับเข้า */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const code = text(new URL(request.url).searchParams.get("code"), 120);
  if (!code) {
    return Response.json(
      { error: "ต้องระบุรหัสสินค้า", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  const item = await lookupSkuForCentral(code);
  return Response.json({ ok: true, item, requestId: auth.requestId });
}

/**
 * สต็อกกลาง: เติม/ตัดยอด, ผูก SKU ของร้านเข้ากับรหัสกลาง, และสั่งหักยอดจากออเดอร์ทันที
 * ทุกการเขียนบันทึก audit log — ยอดสินค้าคือข้อมูลที่กระทบการขายจริง
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const action = text(body.action, 20);
  const ipAddress = getClientIp(request);

  try {
    if (action === "receive") {
      const skuCode = text(body.skuCode);
      const quantity = Math.trunc(Number(body.quantity));
      if (!skuCode) {
        return Response.json(
          { error: "ต้องระบุรหัสสินค้าของสต็อกกลาง", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > MAX_QUANTITY) {
        return Response.json(
          { error: `จำนวนต้องเป็นตัวเลข ไม่เป็นศูนย์ และไม่เกิน ${MAX_QUANTITY.toLocaleString("th-TH")}`, requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const result = await addCentralStock({
        skuCode,
        productName: text(body.productName, 200) || null,
        quantity,
        note: text(body.note, 200) || null,
        actor: auth.session.sub,
      });
      // เขียนยอดใหม่ลงประกาศของทุกร้านที่ผูกไว้ทันที (ยอดตรงแล้วจะไม่เขียน)
      const pushed = await pushPoolToListings({ skuCodes: [result.skuCode] }).catch(() => null);
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.receive",
        ipAddress,
        outcome: "success",
        details: { skuCode: result.skuCode, quantity, onHand: result.onHand },
        requestId: auth.requestId,
      });
      return Response.json({
        ok: true,
        ...result,
        pushed: pushed?.pushed ?? 0,
        pushFailed: pushed?.failed ?? 0,
        requestId: auth.requestId,
      });
    }

    if (action === "push") {
      const skuCodes = Array.isArray(body.skuCodes)
        ? body.skuCodes.map((item) => text(item)).filter(Boolean)
        : undefined;
      const result = await pushPoolToListings({ skuCodes });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.push",
        ipAddress,
        outcome: result.failed > 0 ? "failure" : "success",
        details: { pushed: result.pushed, failed: result.failed, skipped: result.skipped },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, ...result, requestId: auth.requestId });
    }

    if (action === "link" || action === "unlink") {
      const platform = text(body.platform, 20);
      if (!LISTING_PLATFORMS.has(platform)) {
        return Response.json(
          { error: "แพลตฟอร์มไม่ถูกต้อง", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const shopId = text(body.shopId);
      const skuId = text(body.skuId, 60);
      if (!shopId || !skuId) {
        return Response.json(
          { error: "ต้องระบุร้านและ SKU", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }

      if (action === "unlink") {
        await unlinkListing({ platform, shopId, skuId });
      } else {
        const skuCode = text(body.skuCode);
        if (!skuCode) {
          return Response.json(
            { error: "ต้องระบุรหัสสินค้าของสต็อกกลาง", requestId: auth.requestId },
            { status: 400, headers: { "x-request-id": auth.requestId } },
          );
        }
        await linkListing({ platform, shopId, skuId, skuCode, actor: auth.session.sub });
      }
      await recordAuditLog({
        actor: auth.session.sub,
        action: action === "link" ? "platform.central_stock.link" : "platform.central_stock.unlink",
        ipAddress,
        outcome: "success",
        details: { platform, shopId, skuId, skuCode: text(body.skuCode) || null },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, requestId: auth.requestId });
    }

    if (action === "auto-link") {
      const platform = text(body.platform, 20);
      const shopId = text(body.shopId);
      if (!LISTING_PLATFORMS.has(platform) || !shopId) {
        return Response.json(
          { error: "ต้องระบุแพลตฟอร์มและร้าน", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const linked = await autoLinkShop(platform, shopId);
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.auto_link",
        ipAddress,
        outcome: "success",
        details: { platform, shopId, linked },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, linked, requestId: auth.requestId });
    }

    if (action === "reconcile") {
      const hours = Number(body.hours ?? 48);
      const result = await reconcileCentralStock({ hours });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.reconcile",
        ipAddress,
        outcome: "success",
        details: result,
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, ...result, requestId: auth.requestId });
    }

    return Response.json(
      { error: "ไม่รู้จักคำสั่งที่ขอ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "ทำรายการสต็อกกลางไม่สำเร็จ";
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}
