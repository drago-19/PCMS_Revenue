import { requireApiAuth } from "@/lib/auth";
import { listShopeeCategories } from "@/lib/platform/shopee";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import { getPlatformConfig, listPlatformAccounts, SHOPEE_PLATFORM } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 40;

/** ค้นหมวดหมู่สินค้าของ Shopee (เฉพาะหมวดใบสุดท้ายที่สร้างสินค้าได้) */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json({ error: "ยังไม่ได้ตั้งค่าแอป Shopee" }, { status: 400 });
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const account = accounts.find((row) => row.status === "connected") ?? accounts[0];
  if (!account) {
    return Response.json({ error: "ยังไม่ได้เชื่อมร้าน Shopee" }, { status: 400 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();

  try {
    const ctx = await ensureValidShopeeToken(account.accountKey, config.shopee);
    const scope = { accessToken: ctx.accessToken, shopId: ctx.shopId };

    let categories = await listShopeeCategories(config.shopee, scope);
    // บางสภาพแวดล้อม (sandbox) ไม่ส่งชื่อหมวดกลับมาเป็นภาษาไทย — ลองภาษาอังกฤษแทน
    const leavesTh = categories.filter((row) => !row.hasChildren);
    if (leavesTh.length > 0 && leavesTh.every((row) => /^\d+$/.test(row.name.trim()))) {
      const fallback = await listShopeeCategories(config.shopee, { ...scope, language: "en" });
      if (fallback.some((row) => !row.hasChildren && !/^\d+$/.test(row.name.trim()))) {
        categories = fallback;
      }
    }

    const leaves = categories.filter((row) => !row.hasChildren && row.name.trim().length > 0);
    const matched = q ? leaves.filter((row) => row.name.toLowerCase().includes(q)) : leaves;

    return Response.json({
      total: matched.length,
      items: matched.slice(0, MAX_RESULTS).map((row) => ({ id: row.categoryId, name: row.name })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ดึงหมวดหมู่ไม่สำเร็จ";
    return Response.json({ error: message }, { status: 502 });
  }
}
