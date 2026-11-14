import { requireAdmin, requireApiAuth } from "@/lib/auth";
import {
  getPlatformConfig,
  listPlatformAccounts,
  saveTikTokConfig,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สถานะการเชื่อมต่อ TikTok — ไม่ส่ง app_secret หรือ token ออกไป */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);

  return Response.json(
    {
      ok: true,
      configured: Boolean(config.tiktok),
      appKey: config.tiktok?.appKey ?? null,
      serviceId: config.tiktok?.serviceId ?? null,
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
    const config = await saveTikTokConfig(body, auth.session.sub || "user");
    return Response.json(
      {
        ok: true,
        appKey: config.appKey,
        serviceId: config.serviceId,
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
