import { query } from "@/lib/db";
import { callTikTokApi, callTikTokMultipart } from "./tiktok";
import { getPlatformAccountRow, getPlatformConfig, TIKTOK_PLATFORM } from "./store";

type ShopContext = {
  appConfig: NonNullable<Awaited<ReturnType<typeof getPlatformConfig>>["tiktok"]>;
  accessToken: string;
  shopCipher: string;
};

async function requireShop(shopId: string): Promise<ShopContext> {
  const config = await getPlatformConfig();
  if (!config.tiktok) throw new Error("ยังไม่ได้ตั้งค่าแอป TikTok");
  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!account?.accessToken || !account.shopCipher) throw new Error("ไม่พบ token ของร้าน");
  return { appConfig: config.tiktok, accessToken: account.accessToken, shopCipher: account.shopCipher };
}

/**
 * แก้ชื่อสินค้าบน TikTok (partial edit) — ส่งเฉพาะฟิลด์ที่แก้ ไม่แตะรูป/ราคา/หมวด
 */
export async function updateProductTitle({
  shopId,
  productId,
  title,
}: {
  shopId: string;
  productId: string;
  title: string;
}): Promise<{ ok: true }> {
  const ctx = await requireShop(shopId);
  const result = await callTikTokApi<{ errors?: Array<{ message?: string }> }>({
    config: ctx.appConfig,
    accessToken: ctx.accessToken,
    query: { shop_cipher: ctx.shopCipher },
    method: "POST",
    path: `/product/202309/products/${encodeURIComponent(productId)}/partial_edit`,
    body: { title },
  });

  const failure = result.errors?.[0];
  if (failure?.message) throw new Error(failure.message);

  // ชื่อใหม่ต้องเห็นทันทีในหน้าจอ ไม่ต้องรอรอบซิงก์ — เขียนทับในตารางสต็อกของเราเลย
  await query(
    `UPDATE platform_stock
        SET product_name = $1::text, updated_at = now()
      WHERE platform = $2::text AND shop_id = $3::text AND product_id = $4::text`,
    [title, TIKTOK_PLATFORM, shopId, productId],
  );

  return { ok: true };
}

/** อัปโหลดไฟล์รูปขึ้น TikTok แล้วได้ `uri` กลับมา (ยังไม่ผูกกับสินค้า) */
export async function uploadProductImage({
  shopId,
  file,
}: {
  shopId: string;
  file: File;
}): Promise<{ uri: string }> {
  const ctx = await requireShop(shopId);
  const form = new FormData();
  form.append("data", file, file.name || "image.png");

  const result = await callTikTokMultipart<{ uri?: string; errors?: Array<{ message?: string }> }>({
    config: ctx.appConfig,
    accessToken: ctx.accessToken,
    // endpoint อัปโหลดรูปเป็นระดับแอป ไม่ต้องส่ง shop_cipher (TikTok ตอบ error ถ้าส่งมา)
    // use_case=MAIN_IMAGE จำเป็น — ถ้าไม่ระบุ TikTok รับไฟล์แต่ไม่ยอมใช้เป็นรูปหลักของสินค้า
    query: { use_case: "MAIN_IMAGE" },
    path: "/product/202309/images/upload",
    form,
  });

  const failure = result.errors?.[0];
  if (failure?.message) throw new Error(failure.message);
  if (!result.uri) throw new Error("TikTok ไม่คืนรหัสรูป");
  return { uri: result.uri };
}

/** ตั้งรูปหลักของสินค้าเป็นชุด uri ที่อัปโหลดไว้แล้ว */
export async function refreshProductImageInDb({
  shopId,
  productId,
}: {
  shopId: string;
  productId: string;
}): Promise<string | null> {
  const ctx = await requireShop(shopId);

  // TikTok ใช้เวลาสักครู่กว่าจะสะท้อนรูปใหม่ใน Get Product — ลองอ่านซ้ำสั้น ๆ ก่อนยอมแพ้
  // หมายเหตุ: response ของ endpoint นี้วาง main_images ไว้ชั้นบนสุด (ไม่ห่อใน data)
  const readImageUrl = async () => {
    const result = await callTikTokApi<{
      main_images?: Array<{ thumb_urls?: string[]; uri?: string }>;
      data?: { main_images?: Array<{ thumb_urls?: string[]; uri?: string }> };
    }>({
      config: ctx.appConfig,
      accessToken: ctx.accessToken,
      query: { shop_cipher: ctx.shopCipher },
      method: "GET",
      path: `/product/202309/products/${encodeURIComponent(productId)}`,
    });
    const images = result.main_images ?? result.data?.main_images ?? [];
    return images[0]?.thumb_urls?.[0] ?? null;
  };

  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    imageUrl = await readImageUrl().catch(() => null);
    if (imageUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (!imageUrl) return null;

  // อัปเดตรูปในฐานข้อมูลทันที ไม่ต้องรอรอบซิงก์สต็อกรอบถัดไป
  await query(
    `UPDATE platform_stock
        SET image_url = $1::text, updated_at = now()
      WHERE platform = $2::text AND shop_id = $3::text AND product_id = $4::text`,
    [imageUrl, TIKTOK_PLATFORM, shopId, productId],
  );
  return imageUrl;
}

export async function updateProductImages({
  shopId,
  productId,
  uris,
}: {
  shopId: string;
  productId: string;
  uris: string[];
}): Promise<{ ok: true }> {
  const ctx = await requireShop(shopId);
  const result = await callTikTokApi<{ errors?: Array<{ message?: string }> }>({
    config: ctx.appConfig,
    accessToken: ctx.accessToken,
    query: { shop_cipher: ctx.shopCipher },
    method: "POST",
    path: `/product/202309/products/${encodeURIComponent(productId)}/partial_edit`,
    body: { main_images: uris.map((uri) => ({ uri })) },
  });

  const failure = result.errors?.[0];
  if (failure?.message) throw new Error(failure.message);
  return { ok: true };
}

/**
 * สร้างสินค้าใหม่บน TikTok (สถานะเริ่มต้นเป็นแบบร่าง)
 * ต้องมี uri ของรูปที่อัปโหลดด้วย use_case=MAIN_IMAGE แล้ว และหมวดปลายทางที่มีอยู่จริง
 */
export async function createProduct({
  shopId,
  title,
  description,
  categoryId,
  imageUri,
  sellerSku,
  price,
  quantity,
  weightGrams,
  warehouseId,
}: {
  shopId: string;
  title: string;
  description: string;
  categoryId: string;
  imageUri: string;
  sellerSku: string;
  price: number;
  quantity: number;
  weightGrams: number;
  warehouseId: string;
}): Promise<{ productId: string }> {
  const ctx = await requireShop(shopId);
  const result = await callTikTokApi<{
    data?: { product_id?: string };
    product_id?: string;
    errors?: Array<{ message?: string }>;
  }>({
    config: ctx.appConfig,
    accessToken: ctx.accessToken,
    query: { shop_cipher: ctx.shopCipher },
    method: "POST",
    path: "/product/202309/products",
    body: {
      title,
      description,
      category_id: categoryId,
      // ร้านที่ขายหลายภูมิภาคต้องใช้หมวดเวอร์ชัน 2 (TikTok ปฏิเสธ v1 ด้วย error ชัดเจน)
      category_version: "v2",
      main_images: [{ uri: imageUri }],
      package_weight: { value: String(weightGrams), unit: "GRAM" },
      skus: [
        {
          seller_sku: sellerSku,
          // ตามสคีมาของ TikTok: price = { amount, currency } (amount คือราคาขายจริงก่อนลด)
          price: { amount: price.toFixed(2), currency: "THB" },
          inventory: [{ warehouse_id: warehouseId, quantity }],
        },
      ],
    },
  });

  const failure = result.errors?.[0];
  if (failure?.message) throw new Error(failure.message);

  const productId = result.data?.product_id ?? result.product_id ?? null;
  if (!productId) throw new Error("TikTok ไม่คืนรหัสสินค้า");
  return { productId };
}
