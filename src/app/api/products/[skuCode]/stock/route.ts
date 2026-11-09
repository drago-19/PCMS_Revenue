import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { updateProductStock } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ skuCode: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { skuCode } = await context.params;
  const decodedSku = decodeURIComponent(skuCode ?? "").trim();
  if (!decodedSku || decodedSku.length > 150) {
    return Response.json(
      { error: "รหัสสินค้าไม่ถูกต้อง", requestId: auth.requestId },
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
      { error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const productName =
    typeof body.productName === "string" && body.productName.trim().length > 0
      ? body.productName.trim().slice(0, 255)
      : undefined;

  const costPrice =
    typeof body.costPrice === "number" && !Number.isNaN(body.costPrice)
      ? Math.max(0, body.costPrice)
      : typeof body.costPrice === "string" && !Number.isNaN(Number(body.costPrice))
        ? Math.max(0, Number(body.costPrice))
        : undefined;

  const initialStock =
    typeof body.initialStock === "number" && !Number.isNaN(body.initialStock)
      ? Math.max(0, Math.round(body.initialStock))
      : typeof body.initialStock === "string" && !Number.isNaN(Number(body.initialStock))
        ? Math.max(0, Math.round(Number(body.initialStock)))
        : undefined;

  const stockIn =
    typeof body.stockIn === "number" && !Number.isNaN(body.stockIn)
      ? Math.max(0, Math.round(body.stockIn))
      : typeof body.stockIn === "string" && !Number.isNaN(Number(body.stockIn))
        ? Math.max(0, Math.round(Number(body.stockIn)))
        : undefined;

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;

  try {
    const result = await updateProductStock(decodedSku, {
      productName,
      costPrice,
      initialStock,
      stockIn,
      note,
    });

    if (!result.ok) {
      return Response.json(
        { error: "ไม่สามารถอัปเดตสต็อกสินค้าได้", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/products");

    return Response.json(
      {
        ok: true,
        product: result.product,
        requestId: auth.requestId,
      },
      { headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[api/products/[skuCode]/stock] update failed:", err);
    return Response.json(
      { error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
