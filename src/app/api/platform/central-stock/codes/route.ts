import { requireApiAuth } from "@/lib/auth";
import { listCentralStockRows } from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายการรหัสกลางสำหรับตัวเลือกตอนผูก SKU — ค้นได้ทันทีที่พิมพ์ */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 120);
  const list = await listCentralStockRows({ q, pageSize: 30 });

  return Response.json({
    ok: true,
    requestId: auth.requestId,
    rows: list.rows.map((row) => ({
      skuCode: row.skuCode,
      productName: row.productName,
      onHand: row.onHand,
      shopCount: row.shopCount,
      listingCount: row.listingCount,
    })),
  });
}
