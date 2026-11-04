import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import {
  deleteExpenseRecord,
  normalizePaymentMethod,
  normalizePaymentStatus,
  normalizeVatType,
  updateExpenseRecord,
  type UpdateExpenseRecordInput,
} from "@/lib/expenses";

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
      { error: "รหัสรายการไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 1_500_000) {
      return Response.json(
        {
          error: "ไฟล์แนบหรือข้อมูลคำขอมีขนาดใหญ่เกินกำหนด",
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

  const patch: UpdateExpenseRecordInput = {};
  if (typeof body.entryDate === "string" && body.entryDate.trim()) {
    patch.entryDate = body.entryDate.trim();
  }
  if (body.categoryId !== undefined) {
    const cid = Number(body.categoryId);
    if (cid > 0) patch.categoryId = cid;
  }
  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (Number.isFinite(amt) && amt > 0) patch.amount = amt;
  }
  if (typeof body.vendorName === "string") {
    patch.vendorName = body.vendorName.trim();
  }
  if (typeof body.vendorTaxId === "string") {
    patch.vendorTaxId = body.vendorTaxId.trim();
  }
  if (typeof body.taxInvoiceNo === "string") {
    patch.taxInvoiceNo = body.taxInvoiceNo.trim();
  }
  if (typeof body.title === "string") {
    patch.title = body.title.trim();
  }
  if (body.note !== undefined) {
    patch.note = typeof body.note === "string" ? body.note.trim() : null;
  }
  if (body.vatType !== undefined) {
    patch.vatType = normalizeVatType(body.vatType);
  }
  if (body.whtRate !== undefined) {
    const r = Number(body.whtRate);
    if (Number.isFinite(r) && r >= 0) patch.whtRate = r;
  }
  if (body.paymentStatus !== undefined) {
    patch.paymentStatus = normalizePaymentStatus(body.paymentStatus);
  }
  if (body.paymentMethod !== undefined) {
    patch.paymentMethod = normalizePaymentMethod(body.paymentMethod);
  }
  if (body.attachmentUrl !== undefined) {
    patch.attachmentUrl =
      typeof body.attachmentUrl === "string" && body.attachmentUrl.trim()
        ? body.attachmentUrl.trim()
        : null;
  }
  if (body.attachmentName !== undefined) {
    patch.attachmentName =
      typeof body.attachmentName === "string" && body.attachmentName.trim()
        ? body.attachmentName.trim()
        : null;
  }

  try {
    const updated = await updateExpenseRecord(id, patch);
    if (!updated) {
      return Response.json(
        { error: "ไม่พบรายการรายจ่ายที่ต้องการแก้ไข", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/expenses");
    return Response.json(
      { ok: true, record: updated, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[PUT /api/expenses/records/:id] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "ไม่สามารถแก้ไขรายการรายจ่ายได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
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
