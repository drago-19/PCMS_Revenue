import { denyPlatformRole, requireApiAuth } from "@/lib/auth";
import { runWithCompany } from "@/lib/db";
import { markInvoicesPrinted } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * เรียกจากปุ่มพิมพ์ในหน้าใบกำกับฯ — เก็บรอยว่าเลขนี้ขึ้นกระดาษแล้ว
 * เพราะการจัดเรียงเลขใหม่รายเดือนทำได้เฉพาะเดือนที่ยังไม่มีใบไหนถูกพิมพ์
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const denied = denyPlatformRole(auth.session, auth.requestId);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    orderIds?: unknown;
  } | null;
  const orderIds = Array.isArray(body?.orderIds)
    ? Array.from(
        new Set(
          body.orderIds
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
      ).slice(0, 500)
    : [];

  if (orderIds.length === 0) {
    return Response.json(
      { error: "ไม่มีรายการที่จะบันทึกการพิมพ์", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const updated = await runWithCompany(
    auth.session.companyId ?? "dragon19",
    () => markInvoicesPrinted(orderIds),
  );
  return Response.json(
    { ok: true, updated, requestId: auth.requestId },
    { headers: { "x-request-id": auth.requestId } },
  );
}
