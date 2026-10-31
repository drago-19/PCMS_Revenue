import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { getExpensesOverview, upsertMonthlyExpense } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const year = url.searchParams.get("year") || undefined;

  try {
    const data = await getExpensesOverview(year);
    return Response.json(
      { ok: true, data, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[GET /api/expenses] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูลรายจ่ายได้", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) {
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

  const yearMonth = typeof body.yearMonth === "string" ? body.yearMonth.trim() : "";
  const categoryId = Number(body.categoryId);
  const amount = Number(body.amount);
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return Response.json(
      { error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!categoryId || isNaN(categoryId) || categoryId <= 0) {
    return Response.json(
      { error: "กรุณาระบุรหัสคอลัมน์รายจ่าย", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return Response.json(
      { error: "ยอดรายจ่ายต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    await upsertMonthlyExpense(yearMonth, categoryId, amount, note);
    revalidatePath("/expenses");

    return Response.json(
      { ok: true, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[POST /api/expenses] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถบันทึกยอดรายจ่ายได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
