import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { runTikTokSync, SyncUnavailableError } from "@/lib/platform/run-sync";
import { parseSyncWindow } from "@/lib/platform/sync-window";
import { tikTokNowSeconds } from "@/lib/platform/tiktok";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ดึงข้อมูลจาก TikTok
 * - ปุ่มบนแดชบอร์ด: ไม่ส่งพารามิเตอร์ → ดึงย้อน 36 ชม. แล้วตอบกลับทันที
 * - งานตั้งเวลา: เรียกฟังก์ชันเดียวกันจาก scheduler.ts (ไม่ผ่าน HTTP)
 * - backfill: ?from=YYYY-MM-DD&to=YYYY-MM-DD&mode=create|update&wait=1 (ช่วงไม่เกิน 31 วันต่อครั้ง)
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = parseSyncWindow(url.searchParams, tikTokNowSeconds());
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error, requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  const { window, wait } = parsed;

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
