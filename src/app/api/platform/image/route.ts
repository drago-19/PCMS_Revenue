import { requireApiAuth } from "@/lib/auth";
import { isAllowedImageUrl } from "@/lib/platform/image-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/**
 * เสิร์ฟรูปสินค้าจาก CDN ของ TikTok ผ่านเซิร์ฟเวอร์เรา
 * - ต้องล็อกอิน (รูปของร้านไม่ควรเปิดให้ใครก็ได้)
 * - อนุญาตเฉพาะโดเมนที่กำหนด และต้องเป็น https เท่านั้น
 * - ไม่ตาม redirect (กันการวกกลับไปโดเมนอื่น) และจำกัดขนาด/เวลา
 */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get("u") ?? "";
  if (!raw || !isAllowedImageUrl(raw)) {
    return Response.json({ error: "รูปนี้ไม่ได้รับอนุญาต", requestId: auth.requestId }, { status: 400 });
  }

  let upstream: Response | null = null;
  try {
    upstream = await fetch(raw, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: "ดึงรูปไม่สำเร็จ", requestId: auth.requestId }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "ต้นทางตอบผิดพลาด", requestId: auth.requestId }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return Response.json({ error: "ต้นทางไม่ใช่รูปภาพ", requestId: auth.requestId }, { status: 415 });
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    return Response.json({ error: "รูปใหญ่เกินกำหนด", requestId: auth.requestId }, { status: 413 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      // รูปสินค้าเปลี่ยนไม่บ่อย — ให้เบราว์เซอร์แคชไว้หนึ่งวัน ลดการดึงซ้ำ
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src data:",
    },
  });
}
