import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import {
  updateOrderChannel,
  type SwitchableOrderChannel,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CHANNELS = new Set<SwitchableOrderChannel>([
  "Facebook",
  "LINE",
  "Shopee",
  "Other",
]);

async function handleSwitchChannel(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { orderId } = await context.params;
  const decodedOrderId = decodeURIComponent(orderId ?? "").trim();
  if (!decodedOrderId || decodedOrderId.length > 120) {
    return Response.json(
      { error: "รหัสคำสั่งซื้อไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) {
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

  const rawChannel = typeof body.channel === "string" ? body.channel.trim() : "";
  if (!ALLOWED_CHANNELS.has(rawChannel as SwitchableOrderChannel)) {
    return Response.json(
      {
        error: "ช่องทางที่เลือกไม่ถูกต้อง (รองรับ Facebook, LINE, Shopee, Other)",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const updated = await updateOrderChannel(
      decodedOrderId,
      rawChannel as SwitchableOrderChannel,
    );

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
    revalidatePath("/products");
    revalidatePath("/");

    return Response.json(
      { ok: true, result: updated, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[PATCH /api/bills/[orderId]/channel] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: "ไม่สามารถเปลี่ยนช่องทางของออเดอร์ได้ กรุณาลองใหม่อีกครั้ง",
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
  return handleSwitchChannel(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  return handleSwitchChannel(request, context);
}
