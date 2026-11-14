import { createHmac } from "node:crypto";
import { recordAuditLog, requireAdmin, requireApiAuth } from "@/lib/auth";
import {
  getPlatformConfig,
  listPlatformAccounts,
  saveShopeeConfig,
  SHOPEE_PLATFORM,
} from "@/lib/platform/store";
import { setShopeePushConfig } from "@/lib/platform/shopee";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สถานะการเชื่อมต่อ Shopee — ไม่ส่ง partner_key หรือ token ออกไป */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);

  function buildPushCallbackUrl(shopee: { partnerKey: string; redirectBaseUrl?: string | null } | null | undefined) {
    if (!shopee) return null;
    const base = (shopee.redirectBaseUrl ?? "https://revenue.goldpulse-ai.com").replace(/\/+$/, "");
    const token = createHmac("sha256", shopee.partnerKey).update("shopee-push").digest("hex").slice(0, 32);
    return `${base}/api/platform/shopee/webhook?token=${token}`;
  }

  return Response.json(
    {
      ok: true,
      configured: Boolean(config.shopee),
      partnerId: config.shopee?.partnerId ?? null,
      env: config.shopee?.env ?? "sandbox",
      redirectBaseUrl: config.shopee?.redirectBaseUrl ?? null,
      pushCallbackUrl: buildPushCallbackUrl(config.shopee),
      accounts,
      requestId: auth.requestId,
    },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const config = await saveShopeeConfig(body, auth.session.sub || "user");
    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.shopee.config",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: {
        partnerId: config.partnerId,
        env: config.env,
        redirectBaseUrl: config.redirectBaseUrl ?? null,
      },
      requestId: auth.requestId,
    });

    // ลงทะเบียน callback push ให้ตรงกับคีย์ที่เพิ่งบันทึก (Sandbox/Live)
    const base = (config.redirectBaseUrl ?? new URL(request.url).origin).replace(/\/+$/, "");
    const pushToken = createHmac("sha256", config.partnerKey).update("shopee-push").digest("hex").slice(0, 32);
    const push = await setShopeePushConfig(config, `${base}/api/platform/shopee/webhook?token=${pushToken}`);
    return Response.json(
      {
        ok: true,
        partnerId: config.partnerId,
        env: config.env,
        redirectBaseUrl: config.redirectBaseUrl ?? null,
        pushRegistered: push.ok,
        pushMessage: push.ok ? null : push.message,
        requestId: auth.requestId,
      },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "บันทึกค่าไม่สำเร็จ",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}
