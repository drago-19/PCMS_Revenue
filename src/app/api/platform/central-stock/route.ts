import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { getClientIp } from "@/lib/session-token";
import {
  addCentralStock,
  archiveCentralStock,
  setCentralStockImage,
  createCentralStockFromListing,
  linkListing,
  lookupSkuForCentral,
  readListingForCentralLink,
  reconcileCentralStock,
  renameCentralStock,
  renameCentralStockCode,
  restoreCentralStock,
  unlinkListing,
} from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUANTITY = 1_000_000;
const LISTING_PLATFORMS = new Set(["TikTok", "Shopee"]);

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// หมายเหตุ: ทุก action ที่เขียนข้อมูลลงฐานข้อมูลต้องบันทึก audit log
/** ค้นรหัสกลางหนึ่งตัวเพื่อโชว์รูปและจำนวนบนร้านก่อนกดรับเข้า */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  // โหมดอ่านประกาศ: ใช้เป็นตัวอย่างก่อนสร้างรหัสกลางใหม่จากประกาศ (platform + shopId + skuId)
  const listingShopId = text(params.get("shopId"));
  const listingSkuId = text(params.get("skuId"), 60);
  const listingPlatform = text(params.get("platform"), 20);
  if (!params.get("code") && listingShopId && listingSkuId) {
    if (!LISTING_PLATFORMS.has(listingPlatform)) {
      return Response.json(
        { error: "แพลตฟอร์มไม่ถูกต้อง", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    const listing = await readListingForCentralLink({
      platform: listingPlatform,
      shopId: listingShopId,
      skuId: listingSkuId,
    });
    return Response.json({ ok: true, listing, requestId: auth.requestId });
  }

  const code = text(params.get("code"), 120);
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
    // รับรูปเป็น data URL ได้ (จำกัดขนาดที่ 1.8 MB) — คำขอยื่น ๆ ใช้ไม่ถึง
    if (raw.length > 1_800_000) {
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
      // addCentralStock ดันยอดขึ้นประกาศทุกร้านที่ผูกให้แล้ว (สต็อกกลางเป็นเจ้าของยอด)
      // ทางนี้ไม่ดันซ้ำ — ส่งผลที่ได้กลับไปให้หน้าเว็บบอกผู้ใช้ว่าเขียนกี่ประกาศ กี่ร้าน พลาดอะไร และใช้เวลาเท่าไร
      const pushed = result.push;
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.receive",
        ipAddress,
        outcome: "success",
        details: {
          skuCode: result.skuCode,
          quantity,
          onHand: result.onHand,
          pushed: pushed.pushed,
          pushShops: pushed.shops,
          pushBlocked: pushed.blocked,
          pushFailed: pushed.failed,
          pushMs: pushed.ms,
        },
        requestId: auth.requestId,
      });
      return Response.json({
        ok: true,
        skuCode: result.skuCode,
        onHand: result.onHand,
        restored: result.restored,
        pushed: pushed.pushed,
        pushFailed: pushed.failed,
        pushShops: pushed.shops,
        pushBlocked: pushed.blocked,
        pushMs: pushed.ms,
        pushDisabled: pushed.disabled,
        pushErrors: pushed.errors.map((item) => item.error).slice(0, 3),
        requestId: auth.requestId,
      });
    }

    if (action === "rename-code") {
      const from = text(body.skuCode);
      const to = text(body.newSkuCode);
      if (!from || !to) {
        return Response.json(
          { error: "ต้องระบุรหัสเดิมและรหัสใหม่", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const renamed = await renameCentralStockCode({ from, to, actor: auth.session.sub });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.rename_code",
        ipAddress,
        outcome: "success",
        details: renamed,
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, ...renamed, requestId: auth.requestId });
    }

    if (action === "image") {
      const skuCode = text(body.skuCode);
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!skuCode || !match) {
        return Response.json(
          { error: "ต้องระบุรหัสสินค้าและไฟล์รูป JPG/PNG/WEBP", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      await setCentralStockImage({ skuCode, contentType: match[1], buffer: Buffer.from(match[2], "base64") });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.image",
        ipAddress,
        outcome: "success",
        details: { skuCode, contentType: match[1] },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, requestId: auth.requestId });
    }

    if (action === "rename") {
      const skuCode = text(body.skuCode);
      if (!skuCode) {
        return Response.json(
          { error: "ต้องระบุรหัสสินค้า", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      await renameCentralStock({ skuCode, productName: text(body.productName, 200) || null, actor: auth.session.sub });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.central_stock.rename",
        ipAddress,
        outcome: "success",
        details: { skuCode, productName: text(body.productName, 200) || null },
        requestId: auth.requestId,
      });
      return Response.json({ ok: true, requestId: auth.requestId });
    }

    if (action === "archive" || action === "restore") {
      const skuCode = text(body.skuCode);
      if (!skuCode) {
        return Response.json(
          { error: "ต้องระบุรหัสสินค้า", requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      const result = action === "archive"
        ? await archiveCentralStock({ skuCode, actor: auth.session.sub })
        : (await restoreCentralStock({ skuCode, actor: auth.session.sub }), { unlinked: 0 });
      await recordAuditLog({
        actor: auth.session.sub,
        action: action === "archive" ? "platform.central_stock.archive" : "platform.central_stock.restore",
        ipAddress,
        outcome: "success",
        details: { skuCode, ...result },
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
        // create = true คือ "สร้างรหัสกลางใหม่จากประกาศนี้แล้วผูกให้เลย" (ยอดเริ่มต้นจากประกาศ)
        // รหัสที่มีอยู่แล้วต้องไม่ถูกเขียนทับ — ตอบ 409 ให้หน้าจอส่งผู้ใช้ไปโหมดผูกของเดิม
        if (body.create === true) {
          const made = await createCentralStockFromListing({
            platform,
            shopId,
            skuId,
            skuCode,
            actor: auth.session.sub,
          });
          if (!made.created) {
            return Response.json(
              {
                error: `รหัสนี้มีอยู่แล้ว — ใช้ 'ผูกกับรหัสเดิม' แทน`,
                skuCode: made.skuCode,
                requestId: auth.requestId,
              },
              { status: 409, headers: { "x-request-id": auth.requestId } },
            );
          }
          await recordAuditLog({
            actor: auth.session.sub,
            action: "platform.central_stock.link",
            ipAddress,
            outcome: "success",
            details: {
              platform,
              shopId,
              skuId,
              skuCode: made.skuCode,
              created: true,
              onHand: made.onHand,
            },
            requestId: auth.requestId,
          });
          return Response.json({
            ok: true,
            created: true,
            skuCode: made.skuCode,
            onHand: made.onHand,
            requestId: auth.requestId,
          });
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
      return Response.json({ ok: true, created: false, requestId: auth.requestId });
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
