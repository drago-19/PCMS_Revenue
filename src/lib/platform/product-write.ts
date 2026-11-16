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
