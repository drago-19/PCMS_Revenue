import { requireApiAuth } from "@/lib/auth";
import { platformDbName, readPlatform } from "@/lib/platform/platforms";
import { getSkuDetail, productStatusLabel } from "@/lib/platform/stock";
import { listOpenHolds } from "@/lib/platform/stock-hold";
import { listPlatformAccounts } from "@/lib/platform/store";
import { centralStockForShop } from "@/lib/stock/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * รายละเอียดของ SKU หนึ่งตัว สำหรับป๊อปอัปในหน้า /sale/stocks
 *
 * ป๊อปอัปเรียกที่นี่แทนการโหลดหน้าใหม่ทั้งหน้า (เดิมกดแถว = เปลี่ยน ?sku= แล้วให้เซิร์ฟเวอร์เรนเดอร์ใหม่)
 * - ตรวจสิทธิ์แบบเดียวกับ route อื่น (requireApiAuth)
 * - ร้านต้องเป็นร้านที่เชื่อมไว้จริงของแพลตฟอร์มที่ขอ — ไม่คืนข้อมูลข้ามร้าน
 * - เรียกฟังก์ชันที่คิวรีครั้งเดียวต่อตาราง ไม่วนคิวรีทีละแถว
 */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const platform = readPlatform(url.searchParams.get("platform") ?? undefined);
  const dbPlatform = platformDbName(platform);
  const shopId = (url.searchParams.get("shop") ?? "").trim();
  const skuId = (url.searchParams.get("sku") ?? "").trim().slice(0, 120);

  const headers = { "x-request-id": auth.requestId, "Cache-Control": "no-store" };
  if (!shopId || !skuId) {
    return Response.json(
      { error: "ต้องระบุร้านและรหัส SKU", requestId: auth.requestId },
      { status: 400, headers },
    );
  }

  const accounts = await listPlatformAccounts(dbPlatform);
  if (!accounts.some((account) => account.accountKey === shopId)) {
    return Response.json(
      { error: "ไม่พบร้านนี้ในแพลตฟอร์มที่เลือก", requestId: auth.requestId },
      { status: 404, headers },
    );
  }

  try {
    const detail = await getSkuDetail(shopId, skuId, dbPlatform);
    if (!detail) {
      return Response.json(
        { error: "ไม่พบรหัสสินค้านี้ในร้าน", requestId: auth.requestId },
        { status: 404, headers },
      );
    }

    // สต็อกกลางกับยอดที่กันไว้ อ่านครั้งเดียวทั้งร้านแล้วเลือกเฉพาะรหัสนี้ (ไม่คิวรีในลูป)
    const [centralBySku, heldBySku] = await Promise.all([
      centralStockForShop(dbPlatform, shopId),
      platform === "tiktok" ? listOpenHolds(shopId) : Promise.resolve(new Map<string, number>()),
    ]);

    return Response.json(
      {
        ok: true,
        requestId: auth.requestId,
        detail,
        // ป้ายสถานะคิดที่เซิร์ฟเวอร์ — ฝั่งเบราว์เซอร์ไม่ต้องดึงโมดูลที่ต่อฐานข้อมูลเข้ามา
        statusLabel: productStatusLabel(detail.productStatus),
        central: centralBySku.get(skuId) ?? null,
        held: heldBySku.get(skuId) ?? 0,
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error: `อ่านข้อมูลสินค้าไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
        requestId: auth.requestId,
      },
      { status: 500, headers },
    );
  }
}
