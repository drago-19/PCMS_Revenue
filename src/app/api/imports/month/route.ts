import { recordAuditLog, requireAdmin } from "@/lib/auth";
import { runWithCompany } from "@/lib/db";
import { parseImportMonth } from "@/lib/import-month";
import { deleteImportsForMonth, listImportFilesForMonth } from "@/lib/queries";
import { checkApiRateLimit } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ไฟล์นำเข้าที่จะถูกลบเมื่อล้างเดือนนั้น — ให้หน้าจอยืนยันก่อน ด้วย GET /api/imports/month?month=2026-11 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const month = parseImportMonth(new URL(request.url).searchParams.get("month"));
  if (!month) {
    return Response.json(
      { error: "ระบุเดือนที่จะลบเป็นรูปแบบ YYYY-MM" },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const files = await runWithCompany(auth.session.companyId ?? "dragon19", () =>
    listImportFilesForMonth(month),
  );
  return Response.json(
    { month: month.key, label: month.label, files },
    { headers: { "x-request-id": auth.requestId } },
  );
}

export async function DELETE(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const rate = checkApiRateLimit(`imports_write:${auth.ip}`, 30, 60_000);
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

  const url = new URL(request.url);
  const month = parseImportMonth(url.searchParams.get("month"));
  if (!month) {
    return Response.json(
      { error: "ระบุเดือนที่จะลบเป็นรูปแบบ YYYY-MM", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  // ลบทีละชุด — หน้าจอเรียกซ้ำ ๆ จน remaining = 0 (ลบ 90 ไฟล์ในคำขอเดียวยาวเกินจนถูกตัด)
  // ทีละ 2 ไฟล์: ลบหนึ่งไฟล์ใช้ ~13 วินาที (ต้องคำนวณสรุปยอดใหม่) 5 ไฟล์จะแตะเพดานเวลาของ proxy
  const rawLimit = Number(url.searchParams.get("limit") ?? "2");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(20, Math.max(1, Math.trunc(rawLimit)))
    : 2;

  const result = await runWithCompany(auth.session.companyId ?? "dragon19", () =>
    deleteImportsForMonth(month, limit),
  );
  await recordAuditLog({
    actor: auth.session.sub,
    action: "imports.delete_month",
    ipAddress: auth.ip,
    outcome: "success",
    details: {
      month: month.key,
      files: result.files,
      deletedImportIds: result.deleted,
    },
    requestId: auth.requestId,
  });
  return Response.json(
    {
      ok: true,
      month: month.key,
      files: result.files,
      deletedCount: result.deleted.length,
      remaining: result.remaining,
      requestId: auth.requestId,
    },
    { headers: { "x-request-id": auth.requestId } },
  );
}
