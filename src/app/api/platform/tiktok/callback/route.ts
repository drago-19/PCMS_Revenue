import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeAuthCode,
  getAuthorizedShops,
  redactSecret,
  TIKTOK_OAUTH_STATE_COOKIE,
} from "@/lib/platform/tiktok";
import { getPlatformConfig, saveTikTokShop } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/platform?${query}`, request.url));
}

/**
 * รับ redirect กลับจาก TikTok หลังร้านกด Approve
 * - ตรวจ state กับคุกกี้ที่ตั้งไว้ตอนเริ่ม authorize
 * - แลก code เป็น token (code อายุ 30 นาที ใช้ได้ครั้งเดียว จึงแลกทันทีในคำขอนี้)
 * - ดึงร้านที่ authorize ไว้เพื่อเก็บ shop_cipher
 *
 * route นี้ไม่ใช้ requireApiAuth เพราะเป็นการนำทางจาก TikTok มาที่เบราว์เซอร์ของผู้ใช้
 * (ยืนยันตัวตนด้วย state ที่ผูกกับคุกกี้ของผู้ใช้ที่ล็อกอินอยู่แทน)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(TIKTOK_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(TIKTOK_OAUTH_STATE_COOKIE);

  if (denied) return back(request, "tiktok=denied");
  if (!expectedState || !state || state !== expectedState) {
    return back(request, "tiktok=bad_state");
  }
  if (!code || code === "null") return back(request, "tiktok=no_code");

  const config = await getPlatformConfig();
  if (!config.tiktok) return back(request, "tiktok=missing_config");

  try {
    const token = await exchangeAuthCode(config.tiktok, code);
    const shops = await getAuthorizedShops(config.tiktok, token.accessToken);

    if (shops.length === 0) return back(request, "tiktok=no_shop");

    for (const shop of shops) {
      await saveTikTokShop({
        shop,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        grantedScopes: token.grantedScopes,
        sellerName: token.sellerName,
        region: token.sellerBaseRegion,
      });
    }

    return back(request, `tiktok=connected&shops=${shops.length}`);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ";
    // ห้ามให้ app_secret / token หลุดออกมาทาง URL หรือ log
    const message = redactSecret(raw, config.tiktok.appSecret).slice(0, 180);
    console.error("[tiktok/callback] failed", { message });
    return back(request, `tiktok=error&message=${encodeURIComponent(message)}`);
  }
}
