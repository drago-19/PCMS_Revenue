import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { createExpenseCategory, listExpenseCategories } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const categories = await listExpenseCategories();
    return Response.json(
      { ok: true, categories, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[GET /api/expenses/categories] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูลคอลัมน์รายจ่ายได้", requestId: auth.requestId },
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
  const color = typeof body.color === "string" ? body.color.trim() : "slate";

  if (!name) {
    return Response.json(
      { error: "กรุณาระบุชื่อคอลัมน์รายจ่าย", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const created = await createExpenseCategory(name, color);
    revalidatePath("/expenses");

    return Response.json(
      { ok: true, category: created, requestId: auth.requestId },
      { status: 201, headers: { "x-request-id": auth.requestId } },
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
