import {
  verifyWebhookSignature,
  type TikTokAppConfig,
} from "@/lib/platform/tiktok";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import { syncOrders, syncReturns, syncStatements, type SyncContext } from "@/lib/platform/sync";
import { refreshStockForRecentOrders } from "@/lib/platform/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_WINDOW_HOURS = 24;

/**
 * รับแจ้งเตือนจาก TikTok เมื่อข้อมูลเปลี่ยน (สถานะออเดอร์/ยกเลิก/คืนเงิน/ที่อยู่)
 * — อัปเดตเฉพาะร้านที่เกี่ยวข้อง แล้วตอบ 200 ทันที (TikTok ไม่รอผล)
 *
 * route นี้ไม่ใช้ session เพราะ TikTok เรียกเข้ามาเอง; ยืนยันด้วยลายเซ็น HMAC ของ body แทน
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const config = await getPlatformConfig();

  if (!config.tiktok) {
    return Response.json({ ok: false, error: "app not configured" }, { status: 200 });
  }

  const signature = request.headers.get("authorization");
  if (!verifyWebhookSignature({ rawBody, signature, appSecret: config.tiktok.appSecret })) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  type WebhookPayload = { type?: string; shop_id?: string; data?: Record<string, unknown> };
  let payload: WebhookPayload = {};
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return Response.json({ ok: true });
  }

  const shopId = payload.shop_id;
  const eventType = payload.type ?? "UNKNOWN";

  if (!shopId) {
    return Response.json({ ok: true });
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const account = accounts.find((row) => row.accountKey === shopId || row.shopId === shopId);
  if (!account?.shopCipher) {
    return Response.json({ ok: true });
  }

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, account.accountKey);
  if (!row?.accessToken || !row.shopCipher) {
    return Response.json({ ok: true });
  }

  const ctx: SyncContext = {
    config: config.tiktok as TikTokAppConfig,
    accessToken: row.accessToken,
    shopCipher: row.shopCipher,
    shopId: account.accountKey,
  };

  const to = Math.floor(Date.now() / 1000);
  const from = to - SYNC_WINDOW_HOURS * 3600;

  // อัปเดตเบื้องหลัง: ดึงช่วงสั้น ๆ ของร้านนั้น (ออเดอร์ + statement) แล้วเขียนทับ
  void (async () => {
    try {
      const orders = await syncOrders(ctx, from, to);
      // คำขอคืนสินค้าคือเหตุที่ทำให้สต็อกถูกเติมคืนก่อนของถึงร้าน — ดึงทุกครั้งที่มีเหตุการณ์
      const returns = await syncReturns(ctx, from, to);
      const money = await syncStatements(ctx, from, to);
      // อัปเดตสต็อกเฉพาะสินค้าที่อยู่ในออเดอร์ที่เพิ่งเปลี่ยน (ไม่ดึงทั้งแคตตาล็อก)
      const stockChanged = await refreshStockForRecentOrders(ctx.shopId, 120);
      console.log(
        `[webhook] ${eventType} · ${account.shopName ?? account.accountKey}: ออเดอร์ ${orders} · คืนสินค้า ${returns} · statement ${money.statements} · สต็อกเปลี่ยน ${stockChanged}`,
      );
    } catch (err) {
      console.error("[webhook] อัปเดตไม่สำเร็จ", err instanceof Error ? err.message : err);
    }
  })();

  return Response.json({ ok: true });
}
