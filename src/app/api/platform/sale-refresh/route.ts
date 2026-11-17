import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { getActiveShopId, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { runTikTokSync, SyncUnavailableError } from "@/lib/platform/run-sync";
import { syncStock } from "@/lib/platform/stock";
import { tikTokNowSeconds } from "@/lib/platform/tiktok";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 36;

/**
 * ปุ่ม "ดึงข้อมูลล่าสุด" ของหน้าฝ่ายขาย — ทำครั้งเดียวจบ:
 * 1) ออเดอร์ + เงินต่อออเดอร์ (ไม่ดึง statement เพราะหน้าใช้งานไม่ต้องใช้)
 * 2) สต็อกของร้านที่กำลังดูอยู่
 * เรียงทีละขั้นเพื่อไม่ยิง API ซ้อนกันจนชนลิมิตของ TikTok
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const shopId = new URL(request.url).searchParams.get("shop") || (await getActiveShopId(TIKTOK_PLATFORM));
  if (!shopId) {
    return Response.json({ error: "ยังไม่มีร้านที่เชื่อมต่อ", requestId: auth.requestId }, { status: 400 });
  }

  const now = tikTokNowSeconds();

  try {
    const orders = await runTikTokSync({
      from: now - LOOKBACK_HOURS * 3600,
      to: now,
      kind: "sync-now",
      mode: "update",
      skipStatements: true,
      shopId,
    });

    const stock = await syncStock(shopId);

    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.sale.refresh",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId, ...orders.stats, stockSkus: stock.skus, stockChanged: stock.changed },
      requestId: auth.requestId,
    });

    return Response.json(
      {
        ok: true,
        shopId,
        orders: orders.stats.orders,
        stockSkus: stock.skus,
        stockChanged: stock.changed,
        stockError: stock.error ?? null,
        requestId: auth.requestId,
      },
      { headers: { "x-request-id": auth.requestId } },
    );
  } catch (error) {
    if (error instanceof SyncUnavailableError) {
      return Response.json({ error: error.message, requestId: auth.requestId }, { status: 400 });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message.slice(0, 240) : "ดึงข้อมูลไม่สำเร็จ",
        requestId: auth.requestId,
      },
      { status: 502 },
    );
  }
}
