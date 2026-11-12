import { requireApiAuth } from "@/lib/auth";
import { getPlatformAccountRow, getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { syncOrders, syncStatements, type SyncContext } from "@/lib/platform/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 36;

/**
 * ดึงข้อมูลสดทันที (ปุ่มบนแดชบอร์ด)
 * ทำงานเบื้องหลังแล้วตอบกลับทันที — ไม่ให้ผู้ใช้รอ HTTP นาน ๆ
 * หน้าเว็บที่ตั้ง auto-refresh ไว้จะเห็นตัวเลขใหม่ในรอบถัดไป
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.tiktok) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่าแอป TikTok", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const target = accounts.find((row) => row.status === "connected" && row.shopCipher);
  if (!target) {
    return Response.json(
      { error: "ยังไม่มีร้านที่เชื่อมต่อ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, target.accountKey);
  if (!row?.accessToken || !row.shopCipher) {
    return Response.json(
      { error: "ไม่พบ token ของร้าน", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const ctx: SyncContext = {
    config: config.tiktok,
    accessToken: row.accessToken,
    shopCipher: row.shopCipher,
    shopId: target.accountKey,
  };

  const to = Math.floor(Date.now() / 1000);
  const from = to - LOOKBACK_HOURS * 3600;

  // ไม่ await: ปล่อยให้ดึงเบื้องหลัง แล้วตอบกลับทันที
  void (async () => {
    try {
      const orders = await syncOrders(ctx, from, to);
      const money = await syncStatements(ctx, from, to);
      console.log(`[sync-now] ${target.shopName ?? target.accountKey}: ออเดอร์ ${orders} · statement ${money.statements}`);
    } catch (err) {
      console.error("[sync-now] ล้มเหลว", err instanceof Error ? err.message : err);
    }
  })();

  return Response.json(
    {
      ok: true,
      started: true,
      shop: target.shopName,
      lookbackHours: LOOKBACK_HOURS,
      requestId: auth.requestId,
    },
    { status: 202, headers: { "x-request-id": auth.requestId } },
  );
}
