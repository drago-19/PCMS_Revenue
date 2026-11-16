import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { createProduct } from "@/lib/platform/product-write";
import { getPlatformAccountRow, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 5000;

/**
 * สร้างสินค้าใหม่บน TikTok (ร้านทดสอบเท่านั้น)
 * ผู้เรียกต้องอัปโหลดรูปผ่าน /api/platform/tiktok/product/upload ก่อน แล้วส่ง uri มา
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
  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION) : "";
  let categoryId = typeof body.categoryId === "string" ? body.categoryId.trim().slice(0, 40) : "";  const imageUri = typeof body.imageUri === "string" ? body.imageUri.trim().slice(0, 300) : "";
  const sellerSku = typeof body.sellerSku === "string" ? body.sellerSku.trim().slice(0, 80) : "";
  let warehouseId = typeof body.warehouseId === "string" ? body.warehouseId.trim().slice(0, 40) : "";  let price = Number(body.price);
  const quantity = Number(body.quantity);
  const weightGrams = Number(body.weightGrams);

  // หมวด/คลัง: ถ้าไม่ส่งมา ให้ใช้ของสินค้าที่มีอยู่แล้วในร้าน (ตอนนี้ยังไม่มีตัวเลือกหมวดในหน้าจอ)
  if (shopId && (!categoryId || !warehouseId)) {
    const fallback = await query<{ category_id: string | null; warehouse: string | null }>(
      `SELECT category_id, warehouses->0->>'warehouseId' AS warehouse
         FROM platform_stock
        WHERE shop_id = $1 AND category_id IS NOT NULL AND jsonb_array_length(coalesce(warehouses, '[]'::jsonb)) > 0
        LIMIT 1`,
      [shopId],
    );
    categoryId = categoryId || fallback[0]?.category_id || "";
    warehouseId = warehouseId || fallback[0]?.warehouse || "";
  }

  if (!shopId || !categoryId || !imageUri || !warehouseId) {
    return Response.json({ error: "ข้อมูลไม่ครบ (ร้าน/หมวด/รูป/คลัง)", requestId: auth.requestId }, { status: 400 });
  }  if (title.length < 25 || sellerSku.length < 1) {
    return Response.json(
      { error: "ชื่อสินค้าต้องยาว 25–255 ตัวอักษร (ตามที่ TikTok กำหนด) และต้องมีรหัส SKU", requestId: auth.requestId },
      { status: 400 },
    );
  }
  if (!Number.isFinite(price) || price <= 0) {
    return Response.json({ error: "ราคาต้องมากกว่า 0", requestId: auth.requestId }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99999) {
    return Response.json({ error: "จำนวนสต็อกต้องอยู่ระหว่าง 0–99,999", requestId: auth.requestId }, { status: 400 });
  }
  if (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 50000) {
    return Response.json({ error: "น้ำหนักต้องอยู่ระหว่าง 1–50,000 กรัม", requestId: auth.requestId }, { status: 400 });
  }

  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!account) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }
  if (!isSandboxShopName(account.shopName)) {
    return Response.json(
      { error: "ร้านจริงยังไม่เปิดให้เพิ่มสินค้า — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน", requestId: auth.requestId },
      { status: 403 },
    );
  }

  const auditAction = "platform.tiktok.product.create";

  try {
    const result = await createProduct({
      shopId,
      title,
      description,
      categoryId,
      imageUri,
      sellerSku,
      price,
      quantity,
      weightGrams,
      warehouseId,
    });
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, productId: result.productId, title, sellerSku, price, quantity },
      requestId: auth.requestId,
    });
    return Response.json({ ok: true, productId: result.productId, requestId: auth.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: { shopId, title, sellerSku, error: message },
      requestId: auth.requestId,
    });
    return Response.json({ error: message, requestId: auth.requestId }, { status: 422 });
  }
}
