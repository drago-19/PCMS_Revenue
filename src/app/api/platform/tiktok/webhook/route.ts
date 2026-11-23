import {
  verifyWebhookSignature,
  type TikTokAppConfig,
} from "@/lib/platform/tiktok";
import {
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import { getFreshTikTokAccount } from "@/lib/platform/token-freshness";
import { syncOrders, syncReturns, syncStatements, type SyncContext } from "@/lib/platform/sync";
import { reconcileCentralStock } from "@/lib/stock/central";
import { pushPoolToListings } from "@/lib/stock/push";
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
  if (
    !verifyWebhookSignature({
      rawBody,
      signature,
      appSecret: config.tiktok.appSecret,
      appKey: config.tiktok.appKey,
    })
  ) {
    // บันทึกไว้เสมอ — ไม่มีบรรทัดนี้จะแยกไม่ออกว่า "TikTok ไม่ส่งมา" กับ "ส่งมาแต่ลายเซ็นไม่ผ่าน"
    console.warn(`[webhook] ปฏิเสธลายเซ็น · body ${rawBody.length} ไบต์`);
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  type WebhookPayload = { type?: string; shop_id?: string; data?: Record<string, unknown> };
  let payload: WebhookPayload = {};
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return Response.json({ ok: true });
  }

  // TikTok บางเหตุการณ์ส่ง shop_id มาเป็นตัวเลข — เทียบแบบสตริงตรง ๆ ไม่ได้ ไม่งั้นจะข้ามร้านไปเงียบ ๆ
  // ตัดขึ้นบรรทัดใหม่ก่อน log — ค่ามาจาก body ของคนนอก
  const clean = (value: unknown) => String(value ?? "").replace(/[\r\n]/g, " ").slice(0, 60);
  const shopId = payload.shop_id == null ? "" : clean(payload.shop_id);
  const eventType = clean(payload.type ?? "UNKNOWN");
  console.log(`[webhook] เข้ามา ${eventType} · ร้าน ${shopId || "(ไม่มี)"}`);

  if (!shopId) {
    return Response.json({ ok: true });
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM, "all");
  const account = accounts.find((row) => row.accountKey === shopId || row.shopId === shopId);
  if (!account?.shopCipher) {
    console.warn(`[webhook] ไม่รู้จักร้าน ${shopId} — ข้าม`);
    return Response.json({ ok: true });
  }

  const row = await getFreshTikTokAccount(account.accountKey);
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
      // หักยอดกลาง + ดันยอดใหม่ขึ้นประกาศทุกร้านทันที ก่อนงานหนัก (statement/สต็อกทั้งแคตตาล็อก)
      // ลำดับนี้คือสิ่งที่ทำให้ร้านอื่นเห็นยอดใหม่ภายใน 1-2 วินาที และลดโอกาสขายทับ
      // สต็อกกลางเป็นเจ้าของยอด: ขายบน TikTok → ยอดกลางลด → ดันกลับขึ้นประกาศของทุกร้านที่ผูก
      const started = Date.now();
      const central = await reconcileCentralStock({ hours: 2 });
      const pushed = await pushPoolToListings();
      console.log(
        `[central-stock] ${Date.now() - started}ms · หัก tiktok ${central.tiktok} shopee ${central.shopee} facebook ${central.facebook} · ${
          pushed.disabled
            ? "ไม่ดันยอดขึ้นประกาศ (ปิดด้วย STOCK_PUSH_ENABLED=0)"
            : `ดันยอดขึ้นประกาศ ${pushed.pushed} (ข้าม ${pushed.skipped} รอธงร้านจริง ${pushed.blocked} พลาด ${pushed.failed})`
        }`,
      );
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
