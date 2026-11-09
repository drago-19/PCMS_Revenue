import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import { createProduct } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 8192) {
      return Response.json(
        { error: "ข้อมูลคำขอไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const skuCode = typeof body.skuCode === "string" ? body.skuCode.trim() : "";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";

  if (!skuCode) {
    return Response.json(
      { error: "กรุณาระบุรหัสสินค้า (SKU)", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (skuCode.length > 150) {
    return Response.json(
      { error: "รหัสสินค้ามีความยาวเกิน 150 ตัวอักษร", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (!productName) {
    return Response.json(
      { error: "กรุณาระบุชื่อสินค้า", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (productName.length > 255) {
    return Response.json(
      { error: "ชื่อสินค้ามีความยาวเกิน 255 ตัวอักษร", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const defaultPrice =
    typeof body.defaultPrice === "number" && !Number.isNaN(body.defaultPrice)
      ? Math.max(0, body.defaultPrice)
      : typeof body.defaultPrice === "string" && !Number.isNaN(Number(body.defaultPrice))
        ? Math.max(0, Number(body.defaultPrice))
        : 0;

  const costPrice =
    typeof body.costPrice === "number" && !Number.isNaN(body.costPrice)
      ? Math.max(0, body.costPrice)
      : typeof body.costPrice === "string" && !Number.isNaN(Number(body.costPrice))
        ? Math.max(0, Number(body.costPrice))
        : 0;

  const initialStock =
    typeof body.initialStock === "number" && !Number.isNaN(body.initialStock)
      ? Math.max(0, Math.round(body.initialStock))
      : typeof body.initialStock === "string" && !Number.isNaN(Number(body.initialStock))
        ? Math.max(0, Math.round(Number(body.initialStock)))
        : 0;

  const stockIn =
    typeof body.stockIn === "number" && !Number.isNaN(body.stockIn)
      ? Math.max(0, Math.round(body.stockIn))
      : typeof body.stockIn === "string" && !Number.isNaN(Number(body.stockIn))
        ? Math.max(0, Math.round(Number(body.stockIn)))
        : 0;

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;

  try {
    const result = await createProduct({
      skuCode,
      productName,
      defaultPrice,
      costPrice,
      initialStock,
      stockIn,
      note,
    });

    if (!result.ok) {
      const isDuplicate = result.error?.includes("มีอยู่ในระบบแล้ว");
      return Response.json(
        { error: result.error || "ไม่สามารถเพิ่มรหัสสินค้าได้", requestId: auth.requestId },
        { status: isDuplicate ? 409 : 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    revalidatePath("/products");

    return Response.json(
      {
        ok: true,
        product: result.product,
        requestId: auth.requestId,
      },
      { status: 201, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `เกิดข้อผิดพลาดในการเพิ่มสินค้า: ${message}`, requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
