import { requireApiAuth } from "@/lib/auth";
import { getActiveCompanyId } from "@/lib/db";
import { resolveShipnityAccounts } from "@/lib/shipnity/config";
import { forceSyncShipnity } from "@/lib/shipnity/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สั่งซิงก์ออเดอร์จาก Shipnity เดี๋ยวนี้ (ไม่ล้างข้อมูลเดิม — หน้าเว็บยังแสดงของล่าสุดได้ระหว่างรอ) */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const accounts = await resolveShipnityAccounts(await getActiveCompanyId());
  const results = await forceSyncShipnity(accounts);

  return Response.json(
    { ok: true, accounts: accounts.length, results, requestId: auth.requestId },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}
