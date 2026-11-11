import { getActiveCompanyId } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth";
import { clearDayOrdersCache } from "@/lib/shipnity/cache";
import { getShipnityConnectionStatus, removeShipnityAccount } from "@/lib/shipnity/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const companyId = await getActiveCompanyId();
  const status = await getShipnityConnectionStatus(companyId);
  return json({ ok: true, status }, 200, auth.requestId);
}

export async function DELETE(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() || undefined;

  try {
    await removeShipnityAccount(id);
    clearDayOrdersCache();
    return json({ ok: true, requestId: auth.requestId }, 200, auth.requestId);
  } catch {
    return json({ error: "ลบบัญชี Shipnity ไม่สำเร็จ", requestId: auth.requestId }, 500, auth.requestId);
  }
}
