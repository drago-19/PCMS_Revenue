import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { getDocumentSettings, saveDocumentSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const settings = await getDocumentSettings(undefined, true);
  return Response.json(
    { ok: true, settings, requestId: auth.requestId },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}

export async function PUT(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const taxId = typeof body.taxId === "string" ? body.taxId.trim() : "";

  if (!name || !address || !taxId) {
    return Response.json(
      {
        error: "กรุณากรอกชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษีให้ครบถ้วน",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const saved = await saveDocumentSettings(body, {
      actor: auth.session.sub,
      ipAddress: auth.ip,
      requestId: auth.requestId,
    });

    revalidatePath("/", "layout");
    revalidatePath("/settings");
    revalidatePath("/bills");
    revalidatePath("/days");

    return Response.json(
      { ok: true, settings: saved, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[PUT /api/settings] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: "ไม่สามารถบันทึกการตั้งค่าลงฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
