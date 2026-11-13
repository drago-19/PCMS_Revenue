import crypto from "node:crypto";
import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getClientIp } from "@/lib/session-token";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import {
  finishSyncRun,
  startSyncRun,
  syncOrders,
  syncStatements,
  type SyncContext,
} from "@/lib/platform/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_HOURS = 36;
const MAX_LOOKBACK_HOURS = 36;
// กันการยิงช่วงกว้างในคำขอเดียว จนค้างหรือโดนจำกัดอัตรา
const MAX_BACKFILL_DAYS = 31;
// คีย์ของงานตั้งเวลา เก็บใน app_settings (ไม่ต้องฝังใน env หรือในตัว task)
const SYNC_KEY_SETTING = "platform_sync_key";

interface SyncStats {
  orders: number;
  statements: number;
  orderFinance: number;
}

/** งานตั้งเวลาไม่มี session — รับได้เฉพาะเมื่อส่งคีย์ที่ตรงกับค่าในฐานข้อมูล */
async function hasServiceKey(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-sync-key")?.trim() ?? "";
  if (!provided) return false;
  const row = await queryOne<{ value_json: unknown }>(
    "SELECT value_json FROM app_settings WHERE setting_key = $1",
    [SYNC_KEY_SETTING],
  );
  const stored = typeof row?.value_json === "string" ? row.value_json : "";
  if (!stored || stored.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(provided));
}

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
 * - งานตั้งเวลา: ส่ง x-sync-key + ?hours=12
 * - backfill: ?from=YYYY-MM-DD&to=YYYY-MM-DD&wait=1 (ช่วงไม่เกิน 31 วันต่อครั้ง)
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const service = await hasServiceKey(request);

  let actor = "scheduled-sync";
  let requestId: string = crypto.randomUUID();
  let sessionCompanyId = "dragon19";
  if (!service) {
    const auth = requireApiAuth(request);
    if (!auth.ok) return auth.response;
    actor = auth.session.sub;
    requestId = auth.requestId;
    sessionCompanyId = auth.session.companyId ?? "dragon19";
  }

  const config = await getPlatformConfig();
  if (!config.tiktok) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่าแอป TikTok", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const target = accounts.find((row) => row.status === "connected" && row.shopCipher);
  if (!target) {
    return Response.json(
      { error: "ยังไม่มีร้านที่เชื่อมต่อ", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, target.accountKey);
  if (!row?.accessToken || !row.shopCipher) {
    return Response.json(
      { error: "ไม่พบ token ของร้าน", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const fromDay = parseDay(url.searchParams.get("from"));
  const toDay = parseDay(url.searchParams.get("to"));

  let from: number;
  let to: number;
  let kind: string;
  if (fromDay !== null) {
    if (toDay !== null && toDay <= fromDay) {
      return Response.json(
        { error: "ช่วงวันที่ไม่ถูกต้อง (ถึง ต้องอยู่หลัง จาก)", requestId },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }
    if ((toDay ?? now) - fromDay > MAX_BACKFILL_DAYS * 86400) {
      return Response.json(
        { error: `ดึงย้อนได้ครั้งละไม่เกิน ${MAX_BACKFILL_DAYS} วัน`, requestId },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }
    from = fromDay;
    to = toDay ?? now;
    kind = "backfill";
  } else {
    const hours = clampHours(url.searchParams.get("hours"));
    to = now;
    from = to - hours * 3600;
    kind = service ? "scheduled" : "sync-now";
  }

  const ctx: SyncContext = {
    config: config.tiktok,
    accessToken: row.accessToken,
    shopCipher: row.shopCipher,
    shopId: target.accountKey,
  };

  const wait = url.searchParams.get("wait") === "1";

  const runSync = async (): Promise<SyncStats> => {
    const runId = await startSyncRun(
      TIKTOK_PLATFORM,
      kind,
      new Date(from * 1000),
      new Date(to * 1000),
    );
    try {
      const orders = await syncOrders(ctx, from, to);
      const money = await syncStatements(ctx, from, to);
      await finishSyncRun(runId, orders + money.statements + money.orderFinance, null);
      return { orders, statements: money.statements, orderFinance: money.orderFinance };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSyncRun(runId, 0, message);
      throw error;
    }
  };

  if (wait) {
    try {
      const stats = await runSync();
      if (!service) {
        await recordAuditLog({
          actor,
          action: "platform.tiktok.sync",
          ipAddress: getClientIp(request),
          outcome: "success",
          details: { kind, from, to, companyId: sessionCompanyId, ...stats },
          requestId,
        });
      }
      return Response.json(
        { ok: true, kind, shop: target.shopName, from, to, stats, requestId },
        { status: 200, headers: { "x-request-id": requestId } },
      );
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message.slice(0, 240) : "ซิงก์ไม่สำเร็จ",
          requestId,
        },
        { status: 502, headers: { "x-request-id": requestId } },
      );
    }
  }

  // ไม่ await: ปล่อยให้ดึงเบื้องหลัง แล้วตอบกลับทันที
  void runSync().catch((error) => {
    console.error("[sync-now] ล้มเหลว", error instanceof Error ? error.message : error);
  });

  return Response.json(
    {
      ok: true,
      started: true,
      kind,
      shop: target.shopName,
      from,
      to,
      requestId,
    },
    { status: 202, headers: { "x-request-id": requestId } },
  );
}
