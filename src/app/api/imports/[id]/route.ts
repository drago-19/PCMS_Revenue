import ExcelJS from "exceljs";
import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import {
  deleteImport,
  getImport,
  getImportFileBlob,
  getImportSpreadsheetData,
} from "@/lib/queries";
import { checkApiRateLimit } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeSpreadsheetCell(value: string | number | null): string | number | null {
  if (typeof value !== "string" || value.length === 0) return value;
  const firstChar = value[0];
  if (
    firstChar === "=" ||
    firstChar === "+" ||
    firstChar === "@" ||
    firstChar === "\t" ||
    firstChar === "\r"
  ) {
    return `'${value}`;
  }
  if (firstChar === "-" && !/^-\d+(\.\d+)?$/.test(value.trim())) {
    return `'${value}`;
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const rate = checkApiRateLimit(`imports_read:${auth.ip}`, 120, 60_000);
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

  const { id } = await context.params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return Response.json(
      { error: "รหัสการนำเข้าไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "preview";

  if (mode === "download") {
    const blobInfo = await getImportFileBlob(importId);
    if (!blobInfo) {
      return Response.json(
        { error: "ไม่พบไฟล์การนำเข้านี้", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    await recordAuditLog({
      actor: auth.session.sub,
      action: "imports.download",
      ipAddress: auth.ip,
      outcome: "success",
      details: { importId, filename: blobInfo.filename },
      requestId: auth.requestId,
    });

    const safeFilename = encodeURIComponent(
      blobInfo.filename.replace(/[\r\n\0]/g, ""),
    );
    const isCsv = /\.csv$/i.test(blobInfo.filename);
    const contentType = isCsv
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (blobInfo.buffer && blobInfo.buffer.length > 0) {
      return new Response(new Uint8Array(blobInfo.buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${safeFilename}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "x-request-id": auth.requestId,
        },
      });
    }

    // Reconstruct an .xlsx workbook on the fly if original binary wasn't stored
    const data = await getImportSpreadsheetData(importId);
    if (!data) {
      return Response.json(
        { error: "ไม่พบข้อมูลไฟล์นี้", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }
    const workbook = new ExcelJS.Workbook();
    for (const sheet of data.sheets) {
      const ws = workbook.addWorksheet(
        (sheet.name || "Sheet1").replace(/[\\/*?:[\]]/g, "_").slice(0, 31),
      );
      for (const row of sheet.rows) {
        ws.addRow(row.map(sanitizeSpreadsheetCell));
      }
    }
    const outBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const outName = isCsv
      ? `${blobInfo.filename.replace(/\.csv$/i, "")}.xlsx`
      : blobInfo.filename;

    return new Response(new Uint8Array(outBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(outName.replace(/[\r\n\0]/g, ""))}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "x-request-id": auth.requestId,
      },
    });
  }

  const data = await getImportSpreadsheetData(importId);
  if (!data) {
    return Response.json(
      { error: "ไม่พบข้อมูลการนำเข้านี้", requestId: auth.requestId },
      { status: 404, headers: { "x-request-id": auth.requestId } },
    );
  }
  return Response.json(data, {
    status: 200,
    headers: { "x-request-id": auth.requestId },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
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

  const { id } = await context.params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return Response.json(
      { error: "รหัสการนำเข้าไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  const existing = await getImport(importId);
  if (!existing) {
    return Response.json(
      { error: "ไม่พบการนำเข้านี้", requestId: auth.requestId },
      { status: 404, headers: { "x-request-id": auth.requestId } },
    );
  }
  const deleted = await deleteImport(importId);
  await recordAuditLog({
    actor: auth.session.sub,
    action: "imports.delete_one",
    ipAddress: auth.ip,
    outcome: deleted ? "success" : "failure",
    details: { importId, filename: existing.filename },
    requestId: auth.requestId,
  });
  return Response.json(
    { ok: deleted, deletedImport: existing.filename, requestId: auth.requestId },
    { headers: { "x-request-id": auth.requestId } },
  );
}
