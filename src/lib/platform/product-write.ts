import { query } from "@/lib/db";
import { variantNameFromSalesAttributes } from "@/lib/platform/stock-list";
import {
  buildCreateProductPayload,
  type CreateProductSkuInput,
} from "./product-payload";
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
        SET product_name = $1::text,
            name_locked_until = now() + interval '10 minutes',
            updated_at = now()
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
        SET image_url = $1::text,
            image_locked_until = now() + interval '10 minutes',
            updated_at = now()
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
 * ส่งได้หลายรหัสย่อย (ไซส์) ในครั้งเดียว — payload ประกอบที่ buildCreateProductPayload
 */
export async function createProduct({
  shopId,
  title,
  description,
  categoryId,
  imageUri,
  skus,
  weightGrams,
  warehouseId,
  sizeAttributeName,
}: {
  shopId: string;
  title: string;
  description: string;
  categoryId: string;
  imageUri: string;
  skus: CreateProductSkuInput[];
  weightGrams: number;
  warehouseId: string;
  sizeAttributeName?: string;
}): Promise<{ productId: string }> {
  const ctx = await requireShop(shopId);
  const body = buildCreateProductPayload({
    title,
    description,
    categoryId,
    imageUri,
    weightGrams,
    warehouseId,
    skus,
    sizeAttributeName,
  });

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
    body,
  });

  const failure = result.errors?.[0];
  if (failure?.message) throw new Error(failure.message);

  const productId = result.data?.product_id ?? result.product_id ?? null;
  if (!productId) throw new Error("TikTok ไม่คืนรหัสสินค้า");
  return { productId };
}

/** รหัสย่อยของสินค้าที่เพิ่งสร้าง — ใช้ต่อทั้งการตั้งยอดกลางและการผูกประกาศ */
export type CreatedProductSku = {
  skuId: string;
  sellerSku: string | null;
  /** ชื่อไซส์/ตัวเลือกจาก sales_attributes — ค่าว่าง = สินค้านี้ไม่มีตัวเลือก */
  variantName: string;
  quantity: number;
};

/**
 * อ่านสินค้าที่เพิ่งสร้างกลับมาแล้วบันทึกลง platform_stock ของร้านนี้
 *
 * POST /product/202309/products ไม่คืน sku_id ของแต่ละรหัสย่อย จึงต้องอ่านกลับด้วย GET /products/{id}
 * เขียนเฉพาะสินค้าตัวนี้ (ไม่ใช่การซิงก์ทั้งร้าน) เพื่อให้หน้าสต็อกกลางเห็นสินค้าใหม่ได้ทันที
 * คืนรายการรหัสย่อยพร้อม sku_id ให้ผู้เรียกผูกเข้าสต็อกกลางต่อ
 */
export async function registerCreatedProductToStock({
  shopId,
  productId,
  title,
}: {
  shopId: string;
  productId: string;
  title: string;
}): Promise<{ skus: CreatedProductSku[]; imageUrl: string | null }> {
  const ctx = await requireShop(shopId);

  type Detail = {
    status?: string;
    main_images?: Array<{ thumb_urls?: string[]; uri?: string }>;
    skus?: Array<{
      id?: string;
      seller_sku?: string;
      sales_attributes?: Array<{ name?: string; value_name?: string }>;
      inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
      price?: {
        tax_exclusive?: { currency?: string; sale_price?: string };
        sale_price?: string;
        currency?: string;
      };
    }>;
  };

  const detail = await callTikTokApi<Detail>({
    config: ctx.appConfig,
    accessToken: ctx.accessToken,
    query: { shop_cipher: ctx.shopCipher },
    method: "GET",
    path: `/product/202309/products/${encodeURIComponent(productId)}`,
  });

  const imageUrl = detail.main_images?.[0]?.thumb_urls?.[0] ?? detail.main_images?.[0]?.uri ?? null;
  const rows = (detail.skus ?? []).flatMap((sku) => {
    if (!sku.id) return [];
    const warehouses = (sku.inventory ?? []).map((item) => ({
      warehouseId: String(item.warehouse_id ?? ""),
      quantity: Number(item.quantity ?? 0),
    }));
    return [
      {
        skuId: String(sku.id),
        sellerSku: sku.seller_sku ?? null,
        variantName: variantNameFromSalesAttributes(sku.sales_attributes),
        quantity: warehouses.reduce((sum, item) => sum + item.quantity, 0),
        price: sku.price?.tax_exclusive?.sale_price ?? sku.price?.sale_price ?? null,
        currency: sku.price?.tax_exclusive?.currency ?? sku.price?.currency ?? "THB",
        warehouses,
      },
    ];
  });
  if (rows.length === 0) throw new Error("อ่านสินค้าที่สร้างใหม่กลับมาไม่เจอรหัสย่อย");

  const status = detail.status ?? null;
  await query(
    `INSERT INTO platform_stock (platform, shop_id, sku_id, product_id, seller_sku, product_name, image_url, quantity, warehouses, product_status, price, currency, variant_name, updated_at)
     SELECT $1, $2, item.sku_id, $3, item.seller_sku, $4, $5, item.quantity, item.warehouses::jsonb, item.status, item.price::numeric, item.currency, item.variant_name, now()
       FROM unnest($6::text[], $7::text[], $8::int[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[])
            AS item(sku_id, seller_sku, quantity, warehouses, status, price, currency, variant_name)
     ON CONFLICT (shop_id, sku_id) DO UPDATE
       SET platform = EXCLUDED.platform,
           product_id = EXCLUDED.product_id,
           seller_sku = EXCLUDED.seller_sku,
           -- ชื่อ/รูปที่ฝ่ายขายแก้ไว้ต้องไม่ถูกเขียนทับ (กติกาเดียวกับ syncStock)
           product_name = CASE WHEN platform_stock.name_locked_until > now()
                               THEN platform_stock.product_name ELSE EXCLUDED.product_name END,
           image_url = CASE WHEN platform_stock.image_locked_until > now()
                            THEN platform_stock.image_url ELSE COALESCE(EXCLUDED.image_url, platform_stock.image_url) END,
           quantity = EXCLUDED.quantity,
           warehouses = EXCLUDED.warehouses,
           product_status = COALESCE(EXCLUDED.product_status, platform_stock.product_status),
           price = COALESCE(EXCLUDED.price, platform_stock.price),
           currency = COALESCE(EXCLUDED.currency, platform_stock.currency),
           variant_name = EXCLUDED.variant_name,
           updated_at = now()`,
    [
      TIKTOK_PLATFORM,
      shopId,
      productId,
      title,
      imageUrl,
      rows.map((row) => row.skuId),
      rows.map((row) => row.sellerSku),
      rows.map((row) => row.quantity),
      rows.map((row) => JSON.stringify(row.warehouses)),
      rows.map(() => status),
      rows.map((row) => row.price),
      rows.map((row) => row.currency),
      rows.map((row) => row.variantName),
    ],
  );

  return {
    skus: rows.map((row) => ({
      skuId: row.skuId,
      sellerSku: row.sellerSku,
      variantName: row.variantName,
      quantity: row.quantity,
    })),
    imageUrl,
  };
}
