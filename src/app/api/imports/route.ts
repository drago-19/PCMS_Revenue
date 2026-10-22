import { importWorkbook, type ImportProgressEvent, type ImportResult } from "@/lib/ingest/import-service";
import { IngestError } from "@/lib/ingest/parse";
import { deleteAllImports } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const deletedCount = await deleteAllImports();
  return Response.json({ ok: true, deletedCount });
}

const MAX_BYTES = 25 * 1024 * 1024;

export type ImportStreamMessage =
  | ({ type: "progress" } & ImportProgressEvent)
  | { type: "result"; data: ImportResult }
  | { type: "error"; error: string; code?: string; details?: string[]; status?: number };

export async function POST(request: Request) {
  const url = new URL(request.url);
  const streamMode = url.searchParams.get("stream") === "1";

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "ไม่พบไฟล์ที่ส่งมา" }, { status: 400 });
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
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
    let customMapping: Record<string, string> | undefined;
    if (typeof rawCustomMapping === "string" && rawCustomMapping.trim()) {
      try {
        customMapping = JSON.parse(rawCustomMapping) as Record<string, string>;
      } catch {
        // ignore invalid json
      }
    }

    if (!streamMode) {
      const result = await importWorkbook({
        filename: file.name,
        buffer,
        source: "upload",
        customMapping,
      });
      return Response.json(result, { status: result.duplicate ? 200 : 201 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: ImportStreamMessage) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const result = await importWorkbook({
            filename: file.name,
            buffer,
            source: "upload",
            customMapping,
            onProgress: (event) => {
              send({ type: "progress", ...event });
            },
          });
          send({ type: "result", data: result });
        } catch (error) {
          if (error instanceof IngestError) {
            send({
              type: "error",
              error: error.message,
              code: error.code,
              details: error.details ?? [],
              status: 422,
            });
          } else {
            console.error("import failed", error);
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
      },
    });
  } catch (error) {
    if (error instanceof IngestError) {
      return Response.json(
        { error: error.message, code: error.code, details: error.details ?? [] },
        { status: 422 },
      );
    }
    console.error("import failed", error);
    return Response.json(
      { error: "นำเข้าไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองอีกครั้ง" },
      { status: 500 },
    );
  }
}
