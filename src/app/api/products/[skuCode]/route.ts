import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { deleteProduct } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ skuCode: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { skuCode } = await context.params;
  const decodedSku = decodeURIComponent(skuCode ?? "").trim();
  if (!decodedSku) {
    return Response.json(
      { error: "รหัสสินค้าไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const result = await deleteProduct(decodedSku);
    if (!result.ok) {
      return Response.json(
        { error: result.error || "ไม่สามารถลบรหัสสินค้านี้ได้", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/products");

    return Response.json(
      { ok: true, deletedSku: decodedSku, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `เกิดข้อผิดพลาดในการลบสินค้า: ${message}`, requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
