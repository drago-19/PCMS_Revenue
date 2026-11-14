import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { appUrl, getAppBaseUrl } from "@/lib/platform/base-url";
import {
  buildShopeeAuthorizeUrl,
  createShopeeOAuthState,
  SHOPEE_OAUTH_STATE_COOKIE,
} from "@/lib/platform/shopee";
import { getPlatformConfig } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * เริ่มเชื่อมร้าน Shopee: สร้าง state กัน CSRF แล้วพาผู้ใช้ไปหน้า auth_partner ของ Shopee
 * หลังร้านกด Authorize Shopee จะเด้งไปที่ /api/platform/shopee/callback พร้อม code และ shop_id
 */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return NextResponse.redirect(
      appUrl(request, "/settings?tab=platforms&shopee=missing_config"),
    );
  }

  const state = createShopeeOAuthState();
  const base = config.shopee.redirectBaseUrl?.trim() || getAppBaseUrl(request);
  const redirectUri = `${base.replace(/\/+$/, "")}/api/platform/shopee/callback?state=${encodeURIComponent(state)}`;
  const authUrl = buildShopeeAuthorizeUrl(config.shopee, redirectUri);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(SHOPEE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
