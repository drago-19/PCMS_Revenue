import { requireApiAuth } from "@/lib/auth";
import { refreshProductImageInDb } from "@/lib/platform/product-write";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ให้หน้าจอถามซ้ำได้ว่า "รูปใหม่ขึ้นในระบบหรือยัง"
 * TikTok ใช้เวลาสักครู่กว่าจะสะท้อนรูปใหม่ใน Get Product — ตัวนี้จะลองอ่านแล้วเขียน DB ให้
 * คืน imageUrl เมื่อได้ และคืน null ถ้ายังไม่ทัน (หน้าจอค่อยถามใหม่)
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { shopId?: unknown; productId?: unknown } = {};
  try {
    body = (await request.json()) as { shopId?: unknown; productId?: unknown };
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 120) : "";
  const productId = typeof body.productId === "string" ? body.productId.trim().slice(0, 120) : "";
  if (!shopId || !productId) {
    return Response.json({ error: "ต้องระบุร้านและสินค้า", requestId: auth.requestId }, { status: 400 });
  }

  // ต้องเป็นร้านที่อยู่ในระบบจริง
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  if (!accounts.some((row) => row.accountKey === shopId)) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }

  const imageUrl = await refreshProductImageInDb({ shopId, productId }).catch(() => null);
  return Response.json({ ok: true, imageUrl, requestId: auth.requestId });
}
