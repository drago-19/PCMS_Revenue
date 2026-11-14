import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import { shopeeNowSeconds } from "@/lib/platform/shopee";
import { runShopeeSync, type ShopeeSyncWindow } from "@/lib/platform/shopee-sync";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_DAYS = 14;
const MAX_BACKFILL_DAYS = 30;

function parseDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * ซิงก์ข้อมูล Shopee (ออเดอร์ + escrow + สต็อก) ลงตาราง platform_*
 * รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD และ ?wait=1
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const now = shopeeNowSeconds();
  const fromDay = parseDay(url.searchParams.get("from"));
  const toDay = parseDay(url.searchParams.get("to"));
  const shopId = url.searchParams.get("shop")?.trim() || undefined;

  let window: ShopeeSyncWindow;
  if (fromDay !== null) {
    if (toDay !== null && toDay <= fromDay) {
      return Response.json(
        { error: "ช่วงวันที่ไม่ถูกต้อง (ถึง ต้องอยู่หลัง จาก)", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    if ((toDay ?? now) - fromDay > MAX_BACKFILL_DAYS * 86_400) {
      return Response.json(
        { error: `ดึงย้อนได้ครั้งละไม่เกิน ${MAX_BACKFILL_DAYS} วัน`, requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    window = { from: fromDay, to: toDay ?? now, kind: "backfill", mode: "create", shopId };
  } else {
    window = {
      from: now - DEFAULT_LOOKBACK_DAYS * 86_400,
      to: now,
      kind: "sync-now",
      mode: "update",
      shopId,
    };
  }

  const wait = url.searchParams.get("wait") === "1";

  if (wait) {
    try {
      const { stats, shopName, shopId: syncedShopId } = await runShopeeSync(window);
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.shopee.sync",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { ...window, shopId: syncedShopId, ...stats },
        requestId: auth.requestId,
      });
      return Response.json(
        { ok: true, ...window, shop: shopName, shopId: syncedShopId, stats, requestId: auth.requestId },
        { status: 200, headers: { "x-request-id": auth.requestId } },
      );
    } catch (error) {
      if (error instanceof SyncUnavailableError) {
        return Response.json(
          { error: error.message, requestId: auth.requestId },
          { status: 400, headers: { "x-request-id": auth.requestId } },
        );
      }
      return Response.json(
        { error: error instanceof Error ? error.message : "ซิงก์ Shopee ไม่สำเร็จ", requestId: auth.requestId },
        { status: 502, headers: { "x-request-id": auth.requestId } },
      );
    }
  }

  void runShopeeSync(window)
    .then(({ stats }) =>
      recordAuditLog({
        actor: auth.session.sub,
        action: "platform.shopee.sync",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { ...window, ...stats },
        requestId: auth.requestId,
      }),
    )
    .catch((err) => console.error("[shopee/sync-now] background failed", err));

  return Response.json(
    { ok: true, started: true, ...window, requestId: auth.requestId },
    { status: 202, headers: { "x-request-id": auth.requestId } },
  );
}
