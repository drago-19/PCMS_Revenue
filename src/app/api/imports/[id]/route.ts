import ExcelJS from "exceljs";
import {
  deleteImport,
  getImport,
  getImportFileBlob,
  getImportSpreadsheetData,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return Response.json({ error: "รหัสการนำเข้าไม่ถูกต้อง" }, { status: 400 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "preview";

  if (mode === "download") {
    const blobInfo = await getImportFileBlob(importId);
    if (!blobInfo) {
      return Response.json({ error: "ไม่พบไฟล์การนำเข้านี้" }, { status: 404 });
    }

    const safeFilename = encodeURIComponent(blobInfo.filename);
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
        },
      });
    }

    // Reconstruct an .xlsx workbook on the fly if original binary wasn't stored
    const data = await getImportSpreadsheetData(importId);
    if (!data) {
      return Response.json({ error: "ไม่พบข้อมูลไฟล์นี้" }, { status: 404 });
    }
    const workbook = new ExcelJS.Workbook();
    for (const sheet of data.sheets) {
      const ws = workbook.addWorksheet(sheet.name || "Sheet1");
      for (const row of sheet.rows) {
        ws.addRow(row);
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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(outName)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const data = await getImportSpreadsheetData(importId);
  if (!data) {
    return Response.json({ error: "ไม่พบข้อมูลการนำเข้านี้" }, { status: 404 });
  }
  return Response.json(data, { status: 200 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return Response.json({ error: "รหัสการนำเข้าไม่ถูกต้อง" }, { status: 400 });
  }
  const existing = await getImport(importId);
  if (!existing) {
    return Response.json({ error: "ไม่พบการนำเข้านี้" }, { status: 404 });
  }
  const deleted = await deleteImport(importId);
  return Response.json({ ok: deleted, deletedImport: existing.filename });
}
