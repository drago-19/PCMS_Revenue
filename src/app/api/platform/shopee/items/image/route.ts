import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { redactShopeeSecret, ShopeeApiError, updateShopeeItem, uploadShopeeImage } from "@/lib/platform/shopee";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import { getPlatformConfig, listPlatformAccounts, markAccountError, SHOPEE_PLATFORM } from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** เปลี่ยนรูปหลักของสินค้าที่มีอยู่แล้ว: อัปโหลดรูปใหม่เข้าคลังมีเดียแล้วอัปเดตสินค้า */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const itemId = Number.parseInt(String(form.get("itemId") ?? ""), 10);
  const accountKey = String(form.get("accountKey") ?? "").trim();
  const file = form.get("image");

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return Response.json({ error: "ต้องระบุ item_id" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "ต้องแนบรูปใหม่" }, { status: 400 });
  }
  if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
    return Response.json({ error: "รูปต้องเป็น jpg หรือ png" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "รูปต้องมีขนาดไม่เกิน 2 MB" }, { status: 413 });
  }

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json({ error: "ยังไม่ได้ตั้งค่าแอป Shopee" }, { status: 400 });
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const target = accountKey
    ? accounts.find((account) => account.accountKey === accountKey)
    : accounts.find((account) => account.status === "connected") ?? accounts[0];

  if (!target) {
    return Response.json({ error: "ยังไม่ได้เชื่อมร้าน Shopee" }, { status: 400 });
  }

  try {
    const ctx = await ensureValidShopeeToken(target.accountKey, config.shopee);
    const scope = { accessToken: ctx.accessToken, shopId: ctx.shopId };

    const buffer = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadShopeeImage(config.shopee, {
      ...scope,
      data: buffer,
      fileName: file.name || "product.jpg",
    });

    await updateShopeeItem(config.shopee, { ...scope, itemId, imageId: uploaded.imageId });

    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.shopee.update_image",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: { itemId, shopId: ctx.shopId },
      requestId: auth.requestId,
    });

    return Response.json({ ok: true, itemId, imageUrl: uploaded.imageUrl });
  } catch (err) {
    if (err instanceof ShopeeApiError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const raw = err instanceof Error ? err.message : "เปลี่ยนรูปสินค้าไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, target.accountKey, message);
    return Response.json({ error: message }, { status: 502 });
  }
}
