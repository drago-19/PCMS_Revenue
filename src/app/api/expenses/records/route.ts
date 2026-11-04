import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import {
  createExpenseRecord,
  listExpenseRecords,
  normalizePaymentMethod,
  normalizePaymentStatus,
  normalizeVatType,
} from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const yearMonth = url.searchParams.get("yearMonth") || undefined;
  const categoryIdParam = url.searchParams.get("categoryId");
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;
  const year = url.searchParams.get("year") || undefined;
  const paymentStatus = url.searchParams.get("paymentStatus") || undefined;
  const search = url.searchParams.get("search") || undefined;

  try {
    const records = await listExpenseRecords(yearMonth, categoryId, undefined, {
      year,
      paymentStatus,
      search,
    });
    return Response.json(
      { ok: true, records, data: { records }, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[GET /api/expenses/records] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: "ไม่สามารถดึงข้อมูลรายการรายจ่ายย่อยได้",
        requestId: auth.requestId,
      },
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
    if (raw.length > 1_500_000) {
      return Response.json(
        {
          error: "ไฟล์แนบหรือข้อมูลคำขอมีขนาดใหญ่เกินกำหนด (ไม่เกิน 1.2 MB)",
          requestId: auth.requestId,
        },
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

  const entryDate =
    typeof body.entryDate === "string" ? body.entryDate.trim() : "";
  const categoryId = Number(body.categoryId);
  const amount = Number(body.amount);
  const vendorName =
    typeof body.vendorName === "string" ? body.vendorName.trim() : "";
  const vendorTaxId =
    typeof body.vendorTaxId === "string" ? body.vendorTaxId.trim() : "";
  const taxInvoiceNo =
    typeof body.taxInvoiceNo === "string" ? body.taxInvoiceNo.trim() : "";
  const title =
    typeof body.title === "string" ? body.title.trim() : vendorName;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const vatType = normalizeVatType(body.vatType);
  const whtRate = Number.isFinite(Number(body.whtRate))
    ? Number(body.whtRate)
    : 0;
  const paymentStatus = normalizePaymentStatus(body.paymentStatus);
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  const attachmentUrl =
    typeof body.attachmentUrl === "string" && body.attachmentUrl.trim()
      ? body.attachmentUrl.trim()
      : null;
  const attachmentName =
    typeof body.attachmentName === "string" && body.attachmentName.trim()
      ? body.attachmentName.trim()
      : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return Response.json(
      {
        error: "วันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!categoryId || isNaN(categoryId) || categoryId <= 0) {
    return Response.json(
      { error: "กรุณาเลือกหมวดหมู่รายจ่าย", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json(
      { error: "ยอดเงินต้องเป็นตัวเลขที่มากกว่า 0", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!title && !vendorName) {
    return Response.json(
      {
        error: "กรุณาระบุชื่อผู้จำหน่าย หรือรายละเอียดรายการรายจ่าย",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const record = await createExpenseRecord({
      entryDate,
      categoryId,
      amount,
      title,
      note,
      vendorName,
      vendorTaxId,
      taxInvoiceNo,
      vatType,
      whtRate,
      paymentStatus,
      paymentMethod,
      attachmentUrl,
      attachmentName,
    });

    revalidatePath("/expenses");
    return Response.json(
      { ok: true, record, requestId: auth.requestId },
      { status: 201, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[POST /api/expenses/records] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "ไม่สามารถบันทึกรายการรายจ่ายได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
