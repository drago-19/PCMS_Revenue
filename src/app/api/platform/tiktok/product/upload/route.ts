import { requireApiAuth } from "@/lib/auth";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { uploadProductImage } from "@/lib/platform/product-write";
import { getFreshTikTokAccount } from "@/lib/platform/token-freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** อัปโหลดรูปขึ้น TikTok แล้วคืน uri (ยังไม่ผูกกับสินค้า) — ใช้ตอนสร้างสินค้าใหม่ */
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
  const file = form.get("file");
  if (!shopId || !(file instanceof File)) {
    return Response.json({ error: "ข้อมูลไม่ครบ", requestId: auth.requestId }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "รับเฉพาะ JPG, PNG หรือ WebP", requestId: auth.requestId }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "ไฟล์ใหญ่เกิน 8MB", requestId: auth.requestId }, { status: 413 });
  }

  const account = await getFreshTikTokAccount(shopId);
  if (!account) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }
  if (!isSandboxShopName(account.shopName)) {
    return Response.json(
      { error: "ร้านจริงยังไม่เปิดให้เพิ่มสินค้า — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน", requestId: auth.requestId },
      { status: 403 },
    );
  }

  try {
    const { uri } = await uploadProductImage({ shopId, file });
    return Response.json({ ok: true, uri, requestId: auth.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, requestId: auth.requestId }, { status: 422 });
  }
}
