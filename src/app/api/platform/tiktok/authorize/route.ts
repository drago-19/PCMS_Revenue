import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { appUrl } from "@/lib/platform/base-url";
import {
  buildAuthorizeUrl,
  createOAuthState,
  TIKTOK_OAUTH_STATE_COOKIE,
} from "@/lib/platform/tiktok";
import { getPlatformConfig } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * เริ่มเชื่อมร้าน TikTok: สร้าง state กันการปลอมคำขอ แล้วพาผู้ใช้ไปหน้า authorize ของ TikTok
 * หลังร้านกด Approve TikTok จะพากลับมาที่ /api/platform/tiktok/callback พร้อม code
 */
export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.tiktok) {
    return NextResponse.redirect(appUrl(request, "/platform?tiktok=missing_config"));
  }

  const state = createOAuthState();
  const response = NextResponse.redirect(buildAuthorizeUrl(config.tiktok, state));
  response.cookies.set(TIKTOK_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
