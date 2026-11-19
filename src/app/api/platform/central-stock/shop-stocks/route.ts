import { requireApiAuth } from "@/lib/auth";
import { listShopStocksForLinking } from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สินค้าในร้านหนึ่งพร้อมสถานะการผูก — ให้ป๊อปอัพผูก SKU ค้นได้ทันทีที่พิมพ์ (ไม่ต้อง submit ทั้งหน้า) */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const platform = params.get("platform") ?? "";
  const shopId = params.get("shopId") ?? "";
  if (!platform || !shopId) {
    return Response.json({ ok: false, error: "ต้องระบุ platform และ shopId" }, { status: 400 });
  }

  const q = (params.get("q") ?? "").slice(0, 120);
  const filterParam = params.get("filter");
  const linkFilter = filterParam === "linked" || filterParam === "unlinked" ? filterParam : "all";
  const page = Number(params.get("page") ?? "1");

  const list = await listShopStocksForLinking({
    platform,
    shopId,
    q,
    linkFilter,
    page: Number.isFinite(page) ? page : 1,
  });

  return Response.json({ ok: true, requestId: auth.requestId, ...list });
}
