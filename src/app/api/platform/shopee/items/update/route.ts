import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import { redactShopeeSecret, ShopeeApiError, updateShopeeItem, updateShopeePrice } from "@/lib/platform/shopee";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import { getPlatformConfig, listPlatformAccounts, markAccountError, SHOPEE_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PRICE = 100_000_000;

function toInt(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/** แก้ราคา / ชื่อ / คำอธิบายของสินค้าที่มีอยู่บน Shopee */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) {
      return Response.json({ error: "ข้อมูลคำขอใหญ่เกินกำหนด", requestId: auth.requestId }, { status: 413 });
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const itemId = toInt(body.itemId);
  if (!itemId) {
    return Response.json({ error: "ต้องระบุ item_id", requestId: auth.requestId }, { status: 400 });
  }

  const modelId = body.modelId === undefined ? 0 : Number.parseInt(String(body.modelId), 10);
  const price = body.price === undefined ? null : Number.parseFloat(String(body.price));
  const itemName = typeof body.itemName === "string" ? body.itemName.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE)) {
    return Response.json({ error: "ราคาต้องมากกว่า 0 และไม่เกิน 100,000,000", requestId: auth.requestId }, { status: 400 });
  }
  if (itemName && (itemName.length < 20 || itemName.length > 120)) {
    return Response.json({ error: "ชื่อสินค้าต้องยาว 20–120 ตัวอักษร", requestId: auth.requestId }, { status: 400 });
  }
  if (description && (description.length < 60 || description.length > 500)) {
    return Response.json({ error: "คำอธิบายต้องยาว 60–500 ตัวอักษร", requestId: auth.requestId }, { status: 400 });
  }
  if (price === null && !itemName && !description) {
    return Response.json({ error: "ไม่มีข้อมูลที่จะแก้ไข", requestId: auth.requestId }, { status: 400 });
  }
  if (!Number.isInteger(modelId) || modelId < 0) {
    return Response.json({ error: "model_id ไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json({ error: "ยังไม่ได้ตั้งค่าแอป Shopee", requestId: auth.requestId }, { status: 400 });
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const requestedKey = typeof body.accountKey === "string" ? body.accountKey.trim() : "";
  const target = requestedKey
    ? accounts.find((account) => account.accountKey === requestedKey)
    : accounts.find((account) => account.status === "connected") ?? accounts[0];

  if (!target) {
    return Response.json({ error: "ยังไม่ได้เชื่อมร้าน Shopee", requestId: auth.requestId }, { status: 400 });
  }

  try {
    const ctx = await ensureValidShopeeToken(target.accountKey, config.shopee);
    const scope = { accessToken: ctx.accessToken, shopId: ctx.shopId };

    if (price !== null) {
      const result = await updateShopeePrice(config.shopee, { ...scope, itemId, price, modelId });
      if (result.failureList.length > 0) {
        return Response.json(
          { error: "Shopee ปฏิเสธการแก้ราคา (อาจติดโปรโมชั่นหรืออยู่นอกช่วงราคาที่อนุญาต)", detail: result.failureList, requestId: auth.requestId },
          { status: 409, headers: { "x-request-id": auth.requestId } },
        );
      }
    }

    if (itemName || description) {
      await updateShopeeItem(config.shopee, { ...scope, itemId, itemName: itemName || undefined, description: description || undefined });
    }

    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.shopee.update_item",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { itemId, modelId, price, fields: { name: Boolean(itemName), description: Boolean(description) }, shopId: ctx.shopId },
      requestId: auth.requestId,
    });

    return Response.json({ ok: true, itemId, price, requestId: auth.requestId }, { status: 200, headers: { "x-request-id": auth.requestId } });
  } catch (err) {
    if (err instanceof ShopeeApiError || err instanceof SyncUnavailableError) {
      return Response.json({ error: err.message, requestId: auth.requestId }, { status: 400, headers: { "x-request-id": auth.requestId } });
    }
    const raw = err instanceof Error ? err.message : "แก้ไขข้อมูลบน Shopee ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, target.accountKey, message);
    return Response.json({ error: message, requestId: auth.requestId }, { status: 502, headers: { "x-request-id": auth.requestId } });
  }
}
