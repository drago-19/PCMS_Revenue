import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { liveWriteAllowed } from "@/lib/platform/stock-write";
import {
  refreshProductImageInDb,
  updateProductImages,
  uploadProductImage,
} from "@/lib/platform/product-write";
import { getPlatformAccountRow, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * เปลี่ยนรูปหลักของสินค้า: อัปโหลดไฟล์ขึ้น TikTok แล้วผูกกับสินค้าในครั้งเดียว
 * - เปิดเฉพาะร้านทดสอบ
 * - จำกัดชนิดไฟล์และขนาด (8MB) เพื่อไม่ให้เซิร์ฟเวอร์รับของแปลกปลอม
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "ส่งไฟล์ไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const shopId = String(form.get("shopId") ?? "").trim().slice(0, 120);
  const productId = String(form.get("productId") ?? "").trim().slice(0, 60);
  const file = form.get("file");

  if (!shopId || !productId) {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "ไม่พบไฟล์รูป", requestId: auth.requestId }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "รับเฉพาะ JPG, PNG หรือ WebP", requestId: auth.requestId }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "ไฟล์ใหญ่เกิน 8MB", requestId: auth.requestId }, { status: 413 });
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

  const auditAction = "platform.tiktok.product.image";

  try {
    const { uri } = await uploadProductImage({ shopId, file });
    await updateProductImages({ shopId, productId, uris: [uri] });
    // อ่านรูปใหม่จำก TikTok แล้วบันทึกทับใน DB เพื่อให้หน้าจอเห็นรูปใหม่ทันที
    const imageUrl = await refreshProductImageInDb({ shopId, productId }).catch(() => null);
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, productId, uri, bytes: file.size, type: file.type },
      requestId: auth.requestId,
    });
    return Response.json({ ok: true, uri, imageUrl, requestId: auth.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAuditLog({
      actor: auth.session.sub,
      action: auditAction,
      ipAddress: getClientIp(request),
      outcome: "failure",
      details: { shopId, productId, error: message },
      requestId: auth.requestId,
    });
    return Response.json({ error: message, requestId: auth.requestId }, { status: 422 });
  }
}
