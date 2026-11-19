import { requireApiAuth } from "@/lib/auth";
import { getCentralStockDetail } from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายละเอียดรหัสกลาง: ผูกกับร้านไหนบ้าง ยอดบนแต่ละร้าน และการเคลื่อนไหวล่าสุด */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const code = (new URL(request.url).searchParams.get("code") ?? "").slice(0, 120);
  if (!code) {
    return Response.json(
      { error: "ต้องระบุรหัสสินค้า", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  const detail = await getCentralStockDetail(code);
  return Response.json({ ok: true, requestId: auth.requestId, detail });
}
