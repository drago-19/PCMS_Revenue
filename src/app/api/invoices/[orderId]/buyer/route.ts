import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { updateOrderBuyerInfo } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeField(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}

async function handleSaveBuyer(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { orderId } = await context.params;
  const decodedOrderId = decodeURIComponent(orderId ?? "").trim();
  if (!decodedOrderId || decodedOrderId.length > 100) {
    return Response.json(
      { error: "รหัสคำสั่งซื้อไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

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

  const buyerName = sanitizeField(body.buyerName, 300);
  const buyerTaxId = sanitizeField(body.buyerTaxId, 40);
  const buyerAddress = sanitizeField(body.buyerAddress, 600);

  try {
    const updated = await updateOrderBuyerInfo(decodedOrderId, {
      buyerName,
      buyerTaxId,
      buyerAddress,
    });

    if (!updated) {
      return Response.json(
        { error: "ไม่พบคำสั่งซื้อนี้ในระบบ", requestId: auth.requestId },
        { status: 404, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath(`/invoices/${encodeURIComponent(updated.orderId)}`);
    revalidatePath(`/bills/${encodeURIComponent(updated.orderId)}`);
    revalidatePath("/bills");
    revalidatePath("/days");

    return Response.json(
      { ok: true, buyer: updated, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[PATCH /api/invoices/[orderId]/buyer] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: "ไม่สามารถบันทึกข้อมูลผู้ซื้อลงฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  return handleSaveBuyer(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  return handleSaveBuyer(request, context);
}
