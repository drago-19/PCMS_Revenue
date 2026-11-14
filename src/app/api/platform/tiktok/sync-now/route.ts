import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { runTikTokSync, SyncUnavailableError, type SyncWindow } from "@/lib/platform/run-sync";
import { tikTokNowSeconds } from "@/lib/platform/tiktok";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_HOURS = 36;
const MAX_LOOKBACK_HOURS = 36;
// กันการยิงช่วงกว้างในคำขอเดียว จนค้างหรือโดนจำกัดอัตรา
const MAX_BACKFILL_DAYS = 31;

function parseDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function clampHours(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(MAX_LOOKBACK_HOURS, Math.max(1, Math.floor(value)));
}

/**
 * ดึงข้อมูลจาก TikTok
 * - ปุ่มบนแดชบอร์ด: ไม่ส่งพารามิเตอร์ → ดึงย้อน 36 ชม. แล้วตอบกลับทันที
 * - งานตั้งเวลา: เรียกฟังก์ชันเดียวกันจาก scheduler.ts (ไม่ผ่าน HTTP)
 * - backfill: ?from=YYYY-MM-DD&to=YYYY-MM-DD&wait=1 (ช่วงไม่เกิน 31 วันต่อครั้ง)
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const now = tikTokNowSeconds();
  const fromDay = parseDay(url.searchParams.get("from"));
  const toDay = parseDay(url.searchParams.get("to"));

  let window: SyncWindow;
  if (fromDay !== null) {
    if (toDay !== null && toDay <= fromDay) {
      return Response.json(
        { error: "ช่วงวันที่ไม่ถูกต้อง (ถึง ต้องอยู่หลัง จาก)", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    if ((toDay ?? now) - fromDay > MAX_BACKFILL_DAYS * 86400) {
      return Response.json(
        { error: `ดึงย้อนได้ครั้งละไม่เกิน ${MAX_BACKFILL_DAYS} วัน`, requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    window = { from: fromDay, to: toDay ?? now, kind: "backfill", mode: "create" };
  } else {
    const hours = clampHours(url.searchParams.get("hours"));
    window = { from: now - hours * 3600, to: now, kind: "sync-now", mode: "update" };
  }

  const wait = url.searchParams.get("wait") === "1";

  if (wait) {
    try {
      const { stats, shopName } = await runTikTokSync(window);
      await recordAuditLog({
        actor: auth.session.sub,
        action: "platform.tiktok.sync",
        ipAddress: getClientIp(request),
        outcome: "success",
        details: { ...window, companyId: auth.session.companyId ?? "dragon19", ...stats },
        requestId: auth.requestId,
      });
      return Response.json(
        { ok: true, ...window, shop: shopName, stats, requestId: auth.requestId },
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
        {
          error: error instanceof Error ? error.message.slice(0, 240) : "ซิงก์ไม่สำเร็จ",
          requestId: auth.requestId,
        },
        { status: 502, headers: { "x-request-id": auth.requestId } },
      );
    }
  }

  // ไม่ await: ปล่อยให้ดึงเบื้องหลัง แล้วตอบกลับทันที
  void runTikTokSync(window).catch((error) => {
    console.error("[sync-now] ล้มเหลว", error instanceof Error ? error.message : error);
  });

  return Response.json(
    { ok: true, started: true, ...window, requestId: auth.requestId },
    { status: 202, headers: { "x-request-id": auth.requestId } },
  );
}
