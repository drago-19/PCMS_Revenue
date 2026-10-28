import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { saveColumnMappingRules } from "@/lib/column-mapping-settings";
import { importWorkbook, type ImportProgressEvent, type ImportResult } from "@/lib/ingest/import-service";
import { IngestError } from "@/lib/ingest/parse";
import { deleteAllImports } from "@/lib/queries";
import { checkApiRateLimit } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
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

  const deletedCount = await deleteAllImports();
  await recordAuditLog({
    actor: auth.session.sub,
    action: "imports.delete_all",
    ipAddress: auth.ip,
    outcome: "success",
    details: { deletedCount },
    requestId: auth.requestId,
  });
  return Response.json(
    { ok: true, deletedCount, requestId: auth.requestId },
    { headers: { "x-request-id": auth.requestId } },
  );
}

const MAX_BYTES = 25 * 1024 * 1024;

export type ImportStreamMessage =
  | ({ type: "progress" } & ImportProgressEvent)
  | { type: "result"; data: ImportResult }
  | { type: "error"; error: string; code?: string; details?: string[]; status?: number };

export async function POST(request: Request) {
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

  const url = new URL(request.url);
  const streamMode = url.searchParams.get("stream") === "1";

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "ไม่พบไฟล์ที่ส่งมา" }, { status: 400 });
    }
    const safeFilename = file.name.replace(/[\r\n\0]/g, "").slice(0, 255);
    if (!/\.(xlsx|csv)$/i.test(safeFilename)) {
      return Response.json(
        { error: "รองรับเฉพาะไฟล์ .xlsx หรือ .csv เท่านั้น" },
        { status: 400 },
      );
    }
    if (file.size <= 0) {
      return Response.json({ error: "ไฟล์ว่างหรืออ่านไม่ได้" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: "ไฟล์มีขนาดเกิน 25 MB กรุณาแยกไฟล์ก่อนนำเข้า" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawCustomMapping = form.get("customMapping");
    const rawSaveMapping = form.get("saveMapping");
    const shouldSaveMapping =
      rawSaveMapping === null ||
      rawSaveMapping === "1" ||
      rawSaveMapping === "true";
    let customMapping: Record<string, string> | undefined;
    if (typeof rawCustomMapping === "string" && rawCustomMapping.trim()) {
      try {
        const parsed = JSON.parse(rawCustomMapping.slice(0, 16_384)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const cleanMap: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof k === "string" && typeof v === "string") {
              cleanMap[k.slice(0, 120)] = v.slice(0, 120);
            }
          }
          customMapping = cleanMap;
        }
      } catch {
        // ignore invalid json
      }
    }

    if (
      customMapping &&
      Object.keys(customMapping).length > 0 &&
      shouldSaveMapping
    ) {
      await saveColumnMappingRules(
        { headerToFieldKey: customMapping },
        auth.session.sub,
      );
      await recordAuditLog({
        actor: auth.session.sub,
        action: "settings.column_mapping.save_from_upload",
        ipAddress: auth.ip,
        outcome: "success",
        details: { mappedCount: Object.keys(customMapping).length },
        requestId: auth.requestId,
      });
    }

    if (!streamMode) {
      const result = await importWorkbook({
        filename: safeFilename,
        buffer,
        source: "upload",
        customMapping,
      });
      await recordAuditLog({
        actor: auth.session.sub,
        action: "imports.upload",
        ipAddress: auth.ip,
        outcome: "success",
        details: {
          importId: result.importId,
          filename: safeFilename,
          fileSize: file.size,
          orderCount: result.orderCount,
          duplicate: result.duplicate,
        },
        requestId: auth.requestId,
      });
      return Response.json(result, {
        status: result.duplicate ? 200 : 201,
        headers: { "x-request-id": auth.requestId },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: ImportStreamMessage) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const result = await importWorkbook({
            filename: safeFilename,
            buffer,
            source: "upload",
            customMapping,
            onProgress: (event) => {
              send({ type: "progress", ...event });
            },
          });
          await recordAuditLog({
            actor: auth.session.sub,
            action: "imports.upload",
            ipAddress: auth.ip,
            outcome: "success",
            details: {
              importId: result.importId,
              filename: safeFilename,
              fileSize: file.size,
              orderCount: result.orderCount,
              duplicate: result.duplicate,
            },
            requestId: auth.requestId,
          });
          send({ type: "result", data: result });
        } catch (error) {
          await recordAuditLog({
            actor: auth.session.sub,
            action: "imports.upload",
            ipAddress: auth.ip,
            outcome: "failure",
            details: {
              filename: safeFilename,
              fileSize: file.size,
              code: error instanceof IngestError ? error.code : "internal_error",
            },
            requestId: auth.requestId,
          });
          if (error instanceof IngestError) {
            send({
              type: "error",
              error: error.message,
              code: error.code,
              details: error.details ?? [],
              status: 422,
            });
          } else {
            console.error("import failed", {
              requestId: auth.requestId,
              error: error instanceof Error ? error.message : "unknown",
            });
            send({
              type: "error",
              error: "นำเข้าไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองอีกครั้ง",
              status: 500,
            });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "x-request-id": auth.requestId,
      },
    });
  } catch (error) {
    if (error instanceof IngestError) {
      return Response.json(
        { error: error.message, code: error.code, details: error.details ?? [] },
        { status: 422, headers: { "x-request-id": auth.requestId } },
      );
    }
    console.error("import failed", {
      requestId: auth.requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "นำเข้าไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองอีกครั้ง" },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
