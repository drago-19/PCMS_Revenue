import { requireApiAuth } from "@/lib/auth";
import { listPlatformAccounts, setShopCompany, getShopCompany, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * กำหนดว่าร้านนี้สังกัดบริษัทไหน (dragon19 = ดราก้อน 19, seeheng = ชีเฮง)
 * มีผลกับการซิงก์ครั้งถัดไป: ข้อมูลของร้านจะถูกเขียนลง schema ของบริษัทนั้น
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { shopId?: unknown; company?: unknown } = {};
  try {
    body = (await request.json()) as { shopId?: unknown; company?: unknown };
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 120) : "";
  const company = body.company === "seeheng" ? "seeheng" : body.company === "dragon19" ? "dragon19" : null;
  if (!shopId || !company) {
    return Response.json({ error: "ต้องระบุร้านและบริษัท", requestId: auth.requestId }, { status: 400 });
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM, "all");
  if (!accounts.some((row) => row.accountKey === shopId)) {
    return Response.json({ error: "ไม่พบร้านนี้ในระบบ", requestId: auth.requestId }, { status: 404 });
  }

  await setShopCompany(shopId, company);
  return Response.json({ ok: true, shopId, company, requestId: auth.requestId });
}

/** อ่านบริษัทของร้าน (ใช้กับหน้าเว็บที่ต้องแสดงชื่อบริษัท) */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const shopId = new URL(request.url).searchParams.get("shopId") ?? "";
  if (!shopId) {
    return Response.json({ error: "ต้องระบุร้าน", requestId: auth.requestId }, { status: 400 });
  }

  const company = await getShopCompany(shopId);
  return Response.json({ shopId, company, requestId: auth.requestId });
}
