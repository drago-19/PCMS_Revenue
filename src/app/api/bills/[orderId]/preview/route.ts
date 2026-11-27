import { requireApiAuth } from "@/lib/auth";
import { getBillForPreview } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * คืนข้อมูลบิลเต็มก้อน "แถวเดียว" สำหรับเปิดป๊อปอัปดูบิล
 * ใช้ loader ตัวเดียวกับที่หน้า /bills ใช้ จึงได้ตัวเลขและเลขใบกำกับชุดเดียวกัน
 */
export async function GET(
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

  // แบบ ก: ออเดอร์เดียวมีได้หลายแถว (ขาย/คืนเงินคนละวัน) — หน้ารายการส่งวันที่มาด้วย
  const paidDate = new URL(request.url).searchParams.get("date");
  const normalizedPaidDate = /^\d{4}-\d{2}-\d{2}$/.test(paidDate ?? "") ? paidDate : null;

  try {
    const row = await getBillForPreview(decodedOrderId, undefined, normalizedPaidDate);
    if (!row) {
      return Response.json(
        { error: "ไม่พบบิลของคำสั่งซื้อนี้", requestId: auth.requestId },
        {
          status: 404,
          headers: { "x-request-id": auth.requestId, "Cache-Control": "no-store" },
        },
      );
    }

    return Response.json(
      { row, requestId: auth.requestId },
      {
        status: 200,
        headers: { "x-request-id": auth.requestId, "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[GET /api/bills/[orderId]/preview] failed", {
      requestId: auth.requestId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถโหลดข้อมูลบิลได้ กรุณาลองใหม่อีกครั้ง", requestId: auth.requestId },
      {
        status: 500,
        headers: { "x-request-id": auth.requestId, "Cache-Control": "no-store" },
      },
    );
  }
}
