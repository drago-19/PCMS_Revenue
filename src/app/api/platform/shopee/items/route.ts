import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import { SyncUnavailableError } from "@/lib/platform/run-sync";
import {
  addShopeeItem,
  listShopeeLogistics,
  redactShopeeSecret,
  resolveShopeeLeafCategory,
  ShopeeApiError,
  uploadShopeeImage,
} from "@/lib/platform/shopee";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import {
  getPlatformConfig,
  listPlatformAccounts,
  markAccountError,
  SHOPEE_PLATFORM,
} from "@/lib/platform/store";
import { getClientIp } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PRICE = 100_000_000;
const MAX_STOCK = 1_000_000;

function toNumber(value: FormDataEntryValue | null): number {
  const num = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(num) ? num : Number.NaN;
}

/** สร้างสินค้าใหม่บน Shopee: รับ multipart (ข้อมูล + รูป) แล้วอัปโหลดรูปก่อนสร้าง */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart/form-data)", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const itemName = String(form.get("itemName") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const categoryKeyword = String(form.get("categoryKeyword") ?? "").trim();
  const sellerSku = String(form.get("sellerSku") ?? "").trim();
  const price = toNumber(form.get("price"));
  const stock = toNumber(form.get("stock"));
  const weight = toNumber(form.get("weight"));
  const accountKey = String(form.get("accountKey") ?? "").trim();
  const image = form.get("image");

  if (itemName.length < 3 || itemName.length > 120) {
    return Response.json(
      { error: "ชื่อสินค้าต้องยาว 3–120 ตัวอักษร", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
    return Response.json(
      { error: "ราคาต้องมากกว่า 0 และไม่เกิน 100,000,000", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    return Response.json(
      { error: "จำนวนสต็อกต้องเป็นเลขจำนวนเต็ม 0–1,000,000", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return Response.json(
      { error: "น้ำหนักต้องมากกว่า 0 และไม่เกิน 100 กก.", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!(image instanceof File) || image.size === 0) {
    return Response.json(
      { error: "ต้องแนบรูปสินค้า (jpg หรือ png)", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!/^image\/(jpeg|jpg|png)$/i.test(image.type)) {
    return Response.json(
      { error: "รูปต้องเป็น jpg หรือ png เท่านั้น", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: "รูปต้องมีขนาดไม่เกิน 2 MB", requestId: auth.requestId },
      { status: 413, headers: { "x-request-id": auth.requestId } },
    );
  }

  const config = await getPlatformConfig();
  if (!config.shopee) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่าแอป Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const accounts = await listPlatformAccounts(SHOPEE_PLATFORM);
  const target = accountKey
    ? accounts.find((account) => account.accountKey === accountKey)
    : accounts.find((account) => account.status === "connected") ?? accounts[0];

  if (!target) {
    return Response.json(
      { error: "ยังไม่ได้เชื่อมร้าน Shopee", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const ctx = await ensureValidShopeeToken(target.accountKey, config.shopee);
    const scope = { accessToken: ctx.accessToken, shopId: ctx.shopId };

    const category = await resolveShopeeLeafCategory(config.shopee, categoryKeyword, scope);
    if (!category) {
      throw new ShopeeApiError("ไม่พบหมวดหมู่สินค้าที่ใช้ได้จาก Shopee");
    }

    const logistics = await listShopeeLogistics(config.shopee, scope);
    const logisticIds = logistics.slice(0, 3).map((row) => row.channelId);
    if (logisticIds.length === 0) {
      throw new SyncUnavailableError("ร้านนี้ยังไม่มีช่องทางขนส่งที่เปิดใช้ใน Shopee");
    }

    const buffer = new Uint8Array(await image.arrayBuffer());
    const uploaded = await uploadShopeeImage(config.shopee, {
      ...scope,
      data: buffer,
      fileName: image.name || "product.jpg",
    });

    // Shopee บังคับให้รายละเอียดยาว 60–500 ตัวอักษร — เติมประโยคมาตรฐานเมื่อผู้ใช้ไม่ได้กรอก
    const filler = "สินค้านี้สร้างจากระบบ PCMS Revenue เพื่อจัดการสต็อกและยอดขายของร้าน";
    const finalDescription = (
      description.length >= 60 ? description : `${description || itemName} ${filler}`
    ).slice(0, 500).padEnd(60, " ").trim();

    const created = await addShopeeItem(config.shopee, {
      ...scope,
      itemName,
      description: finalDescription,
      price,
      stock,
      weightKg: weight,
      categoryId: category.categoryId,
      imageId: uploaded.imageId,
      logisticIds,
      sellerSku: sellerSku || undefined,
    });

    await recordAuditLog({
      actor: auth.session.sub,
      action: "platform.shopee.add_item",
      ipAddress: getClientIp(request),
      outcome: "success",
      details: {
        itemId: created.itemId,
        shopId: ctx.shopId,
        categoryId: category.categoryId,
        price,
        stock,
      },
      requestId: auth.requestId,
    });

    return Response.json(
      {
        ok: true,
        itemId: created.itemId,
        category: category.name,
        imageUrl: uploaded.imageUrl,
        requestId: auth.requestId,
      },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    if (err instanceof ShopeeApiError || err instanceof SyncUnavailableError) {
      return Response.json(
        { error: err.message, requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    const raw = err instanceof Error ? err.message : "สร้างสินค้าบน Shopee ไม่สำเร็จ";
    const message = redactShopeeSecret(raw, config.shopee.partnerKey);
    await markAccountError(SHOPEE_PLATFORM, target.accountKey, message);
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 502, headers: { "x-request-id": auth.requestId } },
    );
  }
}
