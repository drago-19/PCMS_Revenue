import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import {
  exchangeShopeeAuthCode,
  getShopeeShopInfo,
  parseShopeeCallbackInput,
  redactShopeeSecret,
} from "@/lib/platform/shopee";
import { getPlatformConfig, saveShopeeShop } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * แลก Authorization Code ด้วย Callback URL หรือ code + shop_id โดยตรง
 * ใช้กรณีพัฒนาบน localhost แต่ Test Redirect URL Domain ชี้ไปโดเมนจริง
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json(
      { error: "กรุณาบันทึก Partner ID และ Partner Key ก่อน", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  let body: { callbackUrl?: string; code?: string; shopId?: string };
  try {
    const raw = await request.text();
    if (raw.length > 8192) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as { callbackUrl?: string; code?: string; shopId?: string };
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const parsed = parseShopeeCallbackInput(body);
    const token = await exchangeShopeeAuthCode(config.shopee, parsed);
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
      actor: auth.session.sub,
      action: "platform.shopee.exchange",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { shopId: shopInfo.shopId, env: config.shopee.env },
      requestId: auth.requestId,
    });

    return Response.json(
      {
        ok: true,
        shop: shopInfo,
        env: config.shopee.env,
        requestId: auth.requestId,
      },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    const raw = err instanceof Error ? err.message : "แลก token ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}
