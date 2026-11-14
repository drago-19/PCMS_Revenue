import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { appUrl } from "@/lib/platform/base-url";
import {
  exchangeShopeeAuthCode,
  getShopeeShopInfo,
  redactShopeeSecret,
  SHOPEE_OAUTH_STATE_COOKIE,
} from "@/lib/platform/shopee";
import { getPlatformConfig, saveShopeeShop } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, query: string): NextResponse {
  const response = NextResponse.redirect(appUrl(request, `/settings?tab=platforms&${query}`));
  response.cookies.delete(SHOPEE_OAUTH_STATE_COOKIE);
  return response;
}

/**
 * Shopee Redirect Callback — รับ ?code=...&shop_id=... แล้วแลกเป็น access_token + ดึงชื่อร้าน
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const shopId = url.searchParams.get("shop_id")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(SHOPEE_OAUTH_STATE_COOKIE)?.value ?? "";
  const auth = requireApiAuth(request);

  if (state && expectedState && state !== expectedState) {
    return back(request, "shopee=bad_state");
  }
  if (!expectedState && !auth.ok) {
    return back(request, "shopee=bad_state");
  }
  if (!code || !/^\d+$/.test(shopId)) {
    return back(request, "shopee=no_code");
  }

  const config = await getPlatformConfig();
  if (!config.shopee) return back(request, "shopee=missing_config");

  try {
    const token = await exchangeShopeeAuthCode(config.shopee, { code, shopId });
    const shopInfo = await getShopeeShopInfo(config.shopee, {
      accessToken: token.accessToken,
      shopId: token.shopId,
    });

    await saveShopeeShop({
      shopId: shopInfo.shopId,
      shopName: shopInfo.shopName,
      region: shopInfo.region,
      env: config.shopee.env,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    });

    await recordAuditLog({
      actor: auth.ok ? auth.session.sub : "oauth_callback",
      action: "platform.shopee.connect",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId: shopInfo.shopId, env: config.shopee.env },
      requestId: auth.ok ? auth.requestId : "callback",
    });

    return back(request, `shopee=connected&shop=${encodeURIComponent(shopInfo.shopName)}`);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "เชื่อมต่อ Shopee ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey).slice(0, 180);
    console.error("[shopee/callback] failed", { message });
    return back(request, `shopee=error&message=${encodeURIComponent(message)}`);
  }
}
