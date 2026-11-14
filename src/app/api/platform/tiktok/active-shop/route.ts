import { requireApiAuth } from "@/lib/auth";
import { listPlatformAccounts, setActiveShopId, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เลือกร้าน (จริงหรือทดสอบ) ที่หน้าจอแพลตฟอร์มใช้เป็นค่าเริ่มต้น */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { shopId?: unknown } = {};
  try {
    body = (await request.json()) as { shopId?: unknown };
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 120) : "";
  if (!shopId) {
    return Response.json({ error: "ต้องระบุร้าน", requestId: auth.requestId }, { status: 400 });
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const account = accounts.find((row) => row.accountKey === shopId);
  if (!account) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }

  await setActiveShopId(TIKTOK_PLATFORM, shopId);
  return Response.json({ ok: true, shopId, requestId: auth.requestId });
}
