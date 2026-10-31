import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { deleteExpenseRecord } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      { error: "รหัสรายการไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const deleted = await deleteExpenseRecord(id);
    if (!deleted) {
      return Response.json(
        { error: "ไม่พบรายการรายจ่ายที่ต้องการลบ", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/expenses");
    return Response.json(
      { ok: true, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[DELETE /api/expenses/records/:id] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถลบรายการรายจ่ายได้", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
