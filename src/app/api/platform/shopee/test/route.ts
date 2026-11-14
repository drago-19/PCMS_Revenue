import { requireApiAuth } from "@/lib/auth";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import {
  getShopeeShopInfo,
  listShopeeInventory,
  listShopeeOrderSns,
  redactShopeeSecret,
  shopeeNowSeconds,
} from "@/lib/platform/shopee";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import {
  getPlatformConfig,
  listPlatformAccounts,
  markAccountError,
  SHOPEE_PLATFORM,
} from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ทดสอบดึงข้อมูลจริงจาก Shopee (get_shop_info + ออเดอร์ 15 วัน + สต็อก) โดยยังไม่เขียนข้อมูลธุรกิจลง DB
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json(
      { error: "ยังไม่ได้กรอก Partner ID และ Partner Key", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  let requestedKey = "";
  try {
    const raw = await request.text();
    if (raw) {
      const body = JSON.parse(raw) as { accountKey?: unknown };
      if (typeof body.accountKey === "string") requestedKey = body.accountKey.trim();
    }
  } catch {
    // ไม่ส่ง body หรือไม่ใช่ JSON ใช้ร้านเริ่มต้น
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const target = requestedKey
    ? accounts.find((account) => account.accountKey === requestedKey)
    : accounts.find((account) => account.status === "connected") ?? accounts[0];

  if (!target) {
    return Response.json(
      { error: "ยังไม่ได้เชื่อมร้าน Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const ctx = await ensureValidShopeeToken(target.accountKey, config.shopee);
    const shopInfo = await getShopeeShopInfo(ctx.config, {
      accessToken: ctx.accessToken,
      shopId: ctx.shopId,
    });

    const now = shopeeNowSeconds();
    const orderSns = await listShopeeOrderSns(ctx.config, {
      accessToken: ctx.accessToken,
      shopId: ctx.shopId,
      timeFrom: now - 15 * 86_400,
      timeTo: now,
    });

    let skuCount = 0;
    try {
      const items = await listShopeeInventory(ctx.config, {
        accessToken: ctx.accessToken,
        shopId: ctx.shopId,
      });
      skuCount = items.length;
    } catch {
      // บาง sandbox ไม่มีสินค้า — ไม่ให้ทั้งการทดสอบพัง
    }

    return Response.json(
      {
        ok: true,
        env: ctx.config.env,
        shop: shopInfo.shopName,
        shopId: shopInfo.shopId,
        region: shopInfo.region,
        recentOrders: orderSns.length,
        skus: skuCount,
        requestId: auth.requestId,
      },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    if (err instanceof SyncUnavailableError) {
      return Response.json(
        { error: err.message, requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    const raw = err instanceof Error ? err.message : "ทดสอบเชื่อมต่อ Shopee ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, target.accountKey, message);
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 502, headers: { "x-request-id": auth.requestId } },
    );
  }
}
