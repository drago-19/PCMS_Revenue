import { recordAuditLog, requireAdmin } from "@/lib/auth";
import { runWithCompany } from "@/lib/db";
import { parseImportMonth } from "@/lib/import-month";
import { renumberInvoiceMonth } from "@/lib/queries";
import { checkApiRateLimit } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * จัดเรียงเลขใบกำกับฯ ของทั้งเดือนใหม่ตามเวลาที่ชำระคำสั่งซื้อ
 * ปฏิเสธถ้ามีใบไหนถูกพิมพ์แล้ว (409) — เลขที่ขึ้นกระดาษแล้วเลื่อนไม่ได้
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const rate = checkApiRateLimit(`invoices_write:${auth.ip}`, 10, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: "ส่งคำขอถี่เกินกำหนด กรุณารอสักครู่", requestId: auth.requestId },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "x-request-id": auth.requestId,
        },
      },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    month?: unknown;
  } | null;
  const month = parseImportMonth(
    typeof body?.month === "string" ? body.month : null,
  );
  if (!month) {
    return Response.json(
      { error: "ระบุเดือนที่จะจัดเรียงเป็นรูปแบบ YYYY-MM", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const result = await runWithCompany(auth.session.companyId ?? "dragon19", () =>
    renumberInvoiceMonth(month),
  );

  if (!result.ok) {
    await recordAuditLog({
      actor: auth.session.sub,
      action: "invoices.renumber_month",
      ipAddress: auth.ip,
      outcome: "blocked",
      details: { month: month.key, reason: result.reason, printedCount: result.printedCount },
      requestId: auth.requestId,
    });
    return Response.json(
      {
        error: `เดือนนี้มีใบที่พิมพ์แล้ว ${result.printedCount} ใบ จึงจัดเรียงเลขใหม่ไม่ได้`,
        requestId: auth.requestId,
      },
      { status: 409, headers: { "x-request-id": auth.requestId } },
    );
  }

  await recordAuditLog({
    actor: auth.session.sub,
    action: "invoices.renumber_month",
    ipAddress: auth.ip,
    outcome: "success",
    details: { month: month.key, renumbered: result.renumbered, voided: result.voided },
    requestId: auth.requestId,
  });
  return Response.json(
    {
      ok: true,
      month: month.key,
      renumbered: result.renumbered,
      voided: result.voided,
      requestId: auth.requestId,
    },
    { headers: { "x-request-id": auth.requestId } },
  );
}
