import { requireAdmin, requireApiAuth } from "@/lib/auth";
import { appUrl } from "@/lib/platform/base-url";
import { registerWebhooks, type TikTokAppConfig } from "@/lib/platform/tiktok";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * เปิดรับแจ้งเตือน (webhook) จาก TikTok สำหรับทุกร้านที่เชื่อมไว้
 * เรียกครั้งเดียวหลังเชื่อมร้าน — TikTok จะแจ้งเราเมื่อสถานะออเดอร์/คืนเงิน/ที่อยู่เปลี่ยน
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.tiktok) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่าแอป TikTok", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const address = appUrl(request, "/api/platform/tiktok/webhook").toString();

  // TikTok เก็บที่อยู่เดียวต่อร้าน — การกดจากเครื่อง dev จะไปทับของ production
  // จึงปฏิเสธที่อยู่ที่ไม่ใช่โดเมนสาธารณะ (ยกเว้นตั้งค่า ALLOW_LOCAL_WEBHOOK=1 เพื่อทดสอบโดยเฉพาะ)
  const hostname = new URL(address).hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local");

  if (isLocal && process.env.ALLOW_LOCAL_WEBHOOK !== "1") {
    return Response.json(
      {
        error:
          "ที่อยู่นี้เป็นเครื่อง dev — ถ้าสมัครจากที่นี่จะไปทับ webhook ของ production กรุณากดจากเว็บจริง หรือตั้ง ALLOW_LOCAL_WEBHOOK=1 ถ้าตั้งใจทดสอบ",
        address,
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  const accounts = (await listPlatformAccounts(TIKTOK_PLATFORM)).filter(
    (row) => row.status === "connected" && row.shopCipher,
  );

  const results: Array<{ shop: string | null; ok: boolean; error?: string }> = [];

  for (const account of accounts) {
    const row = await getPlatformAccountRow(TIKTOK_PLATFORM, account.accountKey);
    if (!row?.accessToken || !row.shopCipher) {
      results.push({ shop: account.shopName, ok: false, error: "ไม่มี token" });
      continue;
    }

    try {
      await registerWebhooks({
        config: config.tiktok as TikTokAppConfig,
        accessToken: row.accessToken,
        shopCipher: row.shopCipher,
        address,
      });
      results.push({ shop: account.shopName, ok: true });
    } catch (err) {
      results.push({
        shop: account.shopName,
        ok: false,
        error: err instanceof Error ? err.message : "สมัครไม่สำเร็จ",
      });
    }
  }

  return Response.json(
    { ok: results.every((item) => item.ok), address, results, requestId: auth.requestId },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}
