import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { deleteExpenseCategory, updateExpenseCategory } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!id || isNaN(id) || id <= 0) {
    return Response.json(
      { error: "รหัสคอลัมน์ไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4096) {
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
  const color = typeof body.color === "string" ? body.color.trim() : undefined;

  if (!name) {
    return Response.json(
      { error: "กรุณาระบุชื่อคอลัมน์รายจ่าย", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const updated = await updateExpenseCategory(id, name, color);
    if (!updated) {
      return Response.json(
        { error: "ไม่พบคอลัมน์รายจ่ายที่ต้องการแก้ไข", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/expenses");
    return Response.json(
      { ok: true, category: updated, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    const isDuplicate = msg.includes("unique") || msg.includes("duplicate");
    return Response.json(
      {
        error: isDuplicate ? "มีชื่อคอลัมน์รายจ่ายนี้อยู่ในระบบแล้ว" : msg,
        requestId: auth.requestId,
      },
      { status: isDuplicate ? 409 : 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!id || isNaN(id) || id <= 0) {
    return Response.json(
      { error: "รหัสคอลัมน์ไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const deleted = await deleteExpenseCategory(id);
    if (!deleted) {
      return Response.json(
        { error: "ไม่พบคอลัมน์รายจ่ายที่ต้องการลบ", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/expenses");
    return Response.json(
      { ok: true, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[DELETE /api/expenses/categories/:id] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถลบคอลัมน์รายจ่ายได้", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
