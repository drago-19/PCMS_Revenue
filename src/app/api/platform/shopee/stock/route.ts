import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import {
  deleteShopeeItem,
  redactShopeeSecret,
  setShopeeStock,
  unlistShopeeItem,
} from "@/lib/platform/shopee";
import { ensureValidShopeeToken, syncShopeeStock } from "@/lib/platform/shopee-sync";
import {
  getPlatformConfig,
  listPlatformAccounts,
  markAccountError,
  SHOPEE_PLATFORM,
} from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUANTITY = 1_000_000;

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * เขียนข้อมูลกลับไป Shopee: ตั้งจำนวนสต็อก, ซ่อนสินค้า หรือลบสินค้า
 * ทำงานเฉพาะร้านที่เชื่อมไว้ใน platform_accounts เท่านั้น (กันการเขียนผิดร้าน)
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

  const action = typeof body.action === "string" ? body.action : "";
  const itemId = toPositiveInt(body.itemId);
  const modelId = body.modelId === undefined ? 0 : Number.parseInt(String(body.modelId), 10);

  if (!itemId) {
    return Response.json(
      { error: "ต้องระบุ item_id ของสินค้า Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!Number.isInteger(modelId) || modelId < 0) {
    return Response.json(
      { error: "model_id ไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const quantity = action === "set_stock" ? toPositiveInt(body.quantity ?? 0) : null;
  if (action === "set_stock" && (quantity === null || quantity > MAX_QUANTITY)) {
    return Response.json(
      { error: "จำนวนสต็อกต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (action !== "set_stock" && action !== "unlist" && action !== "delete") {
    return Response.json(
      { error: "ไม่รู้จักคำสั่งที่ขอ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่าแอป Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const requestedKey = typeof body.accountKey === "string" ? body.accountKey.trim() : "";
  const target = requestedKey
    ? accounts.find((account) => account.accountKey === requestedKey)
    : accounts.find((account) => account.status === "connected") ?? accounts[0];

  if (!target) {
    return Response.json(
      { error: "ยังไม่ได้เชื่อมร้าน Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const ctx = await ensureValidShopeeToken(target.accountKey, config.shopee);
    const scope = { accessToken: ctx.accessToken, shopId: ctx.shopId };

    if (action === "set_stock") {
      const result = await setShopeeStock(config.shopee, {
        ...scope,
        itemId,
        quantity: quantity ?? 0,
        modelId,
      });
      const failed = result.failureList.length > 0;
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.shopee.stock",
        ipAddress: getClientIp(request),
        outcome: failed ? "failure" : "success",
        details: { itemId, modelId, quantity, shopId: ctx.shopId },
        requestId: auth.requestId,
      });
      if (failed) {
        return Response.json(
          {
            error: "Shopee ปฏิเสธการแก้สต็อก (สินค้าอาจอยู่ในโปรโมชั่นหรือจำนวนต่ำกว่าที่ถูกจอง)",
            detail: result.failureList,
            requestId: auth.requestId,
          },
          { status: 409, headers: { "x-request-id": auth.requestId } },
        );
      }
      // ซิงก์กลับเพื่อให้ตัวเลขบนหน้าเว็บตรงกับ Shopee ทันที
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    await syncShopeeStock(target.accountKey).catch(() => undefined);
      return Response.json(
        { ok: true, action, itemId, quantity, requestId: auth.requestId },
        { status: 200, headers: { "x-request-id": auth.requestId } },
      );
    }

    if (action === "unlist") {
      const result = await unlistShopeeItem(config.shopee, { ...scope, itemId });
      const failed = result.failureList.length > 0;
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.shopee.unlist",
        ipAddress: getClientIp(request),
        outcome: failed ? "failure" : "success",
        details: { itemId, shopId: ctx.shopId },
        requestId: auth.requestId,
      });
      if (failed) {
        return Response.json(
          { error: "Shopee ปฏิเสธการซ่อนสินค้า", detail: result.failureList, requestId: auth.requestId },
          { status: 409, headers: { "x-request-id": auth.requestId } },
        );
      }
      // สินค้าที่ถูกซ่อนจะหลุดจากรายการที่ดึงมา — ซิงก์เพื่อให้หน้าเว็บอัปเดตทันที
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    await syncShopeeStock(target.accountKey).catch(() => undefined);
      return Response.json(
        { ok: true, action, itemId, requestId: auth.requestId },
        { status: 200, headers: { "x-request-id": auth.requestId } },
      );
    }

    await deleteShopeeItem(config.shopee, { ...scope, itemId });
    // สินค้าที่ถูกลบจะหายจากรายการที่ดึงมา — ซิงก์เพื่อให้แถวในฐานข้อมูลหายตามทันที
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await syncShopeeStock(target.accountKey).catch(() => undefined);
    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.shopee.delete_item",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { itemId, shopId: ctx.shopId },
      requestId: auth.requestId,
    });
    return Response.json(
      { ok: true, action, itemId, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    if (err instanceof SyncUnavailableError) {
      return Response.json(
        { error: err.message, requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    const raw = err instanceof Error ? err.message : "เขียนข้อมูลไป Shopee ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, target.accountKey, message);
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 502, headers: { "x-request-id": auth.requestId } },
    );
  }
}
