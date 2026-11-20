/**
 * ประกอบ payload สำหรับ POST /product/202309/products (สร้างสินค้าใหม่บน TikTok)
 * แยกออกมาเป็นฟังก์ชันล้วน เพื่อเขียน unit test ได้โดยไม่ต้องต่อฐานข้อมูล/เน็ต
 */

/** ชื่อแอตทริบิวต์ไซส์ที่ TikTok ใช้กับสินค้าแฟชั่น (ค่าเริ่มต้น) */
export const DEFAULT_SIZE_ATTRIBUTE_NAME = "Size";

/** TikTok รับได้สูงสุด 100 รหัสย่อยต่อสินค้า */
export const MAX_PRODUCT_SKUS = 100;

export type CreateProductSkuInput = {
  sellerSku: string;
  /** ชื่อไซส์ เช่น Free size / Plus size / M — ไม่ใส่ = สินค้ารหัสเดียว ไม่มีตัวเลือก */
  sizeName?: string | null;
  price: number;
  quantity: number;
};

export type CreateProductInput = {
  title: string;
  description: string;
  categoryId: string;
  imageUri: string;
  weightGrams: number;
  warehouseId: string;
  skus: CreateProductSkuInput[];
  /** เปลี่ยนชื่อแอตทริบิวต์ไซส์ได้เมื่อหมวดนั้นใช้ชื่ออื่น */
  sizeAttributeName?: string;
};

export type TikTokCreateProductSku = {
  seller_sku: string;
  price: { amount: string; currency: "THB" };
  inventory: Array<{ warehouse_id: string; quantity: number }>;
  sales_attributes?: Array<{ name: string; value_name: string }>;
};

export type TikTokCreateProductPayload = {
  title: string;
  description: string;
  category_id: string;
  category_version: "v2";
  main_images: Array<{ uri: string }>;
  package_weight: { value: string; unit: "GRAM" };
  skus: TikTokCreateProductSku[];
};

/** ตัดช่องว่างหัวท้ายของรหัสย่อย/ชื่อไซส์ และคืนค่าเป็นลิสต์ใหม่ (ไม่แก้ค่าเดิมของผู้เรียก) */
export function normalizeCreateProductSkus(
  skus: Array<{ sellerSku?: string | null; sizeName?: string | null; price: number; quantity: number }>,
): CreateProductSkuInput[] {
  return (skus ?? []).map((sku) => ({
    sellerSku: (sku.sellerSku ?? "").trim(),
    sizeName: (sku.sizeName ?? "").trim() || null,
    price: sku.price,
    quantity: sku.quantity,
  }));
}

/**
 * ตรวจความถูกต้องของลิสต์รหัสย่อย — โยน Error ภาษาไทยเมื่อไม่ผ่าน
 * ราคาต้องมากกว่า 0 และสต็อกต้องเป็นจำนวนเต็ม 0 ขึ้นไป (ห้ามเชื่อค่าจากฝั่งจอ)
 */
export function assertCreateProductSkus(skus: CreateProductSkuInput[]): void {
  if (!skus.length) throw new Error("ต้องมีรหัสสินค้าอย่างน้อย 1 รหัส");
  if (skus.length > MAX_PRODUCT_SKUS) {
    throw new Error(`เพิ่มได้ไม่เกิน ${MAX_PRODUCT_SKUS} รหัสย่อยต่อสินค้า`);
  }

  const seen = new Set<string>();
  for (const sku of skus) {
    const code = (sku.sellerSku ?? "").trim();
    if (!code) throw new Error("ต้องกรอกรหัสย่อยให้ครบทุกแถว");
    const key = code.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new Error(`รหัสย่อยซ้ำ: ${code}`);
    seen.add(key);

    if (!Number.isFinite(sku.price) || sku.price <= 0) {
      throw new Error(`ราคาของรหัส ${code} ต้องมากกว่า 0`);
    }
    if (!Number.isInteger(sku.quantity) || sku.quantity < 0 || sku.quantity > 99999) {
      throw new Error(`สต็อกของรหัส ${code} ต้องเป็นจำนวนเต็ม 0–99,999`);
    }
  }
}

/**
 * สร้าง body ของ POST /product/202309/products
 * - รหัสเดียว (ไม่มีชื่อไซส์เลย) → ไม่ส่ง sales_attributes
 * - หลายไซส์ → ใส่ sales_attributes [{ name, value_name }] ตามชื่อไซส์ที่กรอก
 */
export function buildCreateProductPayload(input: CreateProductInput): TikTokCreateProductPayload {
  const skus = normalizeCreateProductSkus(input.skus);
  assertCreateProductSkus(skus);

  const sizeAttributeName = (input.sizeAttributeName ?? "").trim() || DEFAULT_SIZE_ATTRIBUTE_NAME;

  return {
    title: input.title,
    description: input.description,
    category_id: input.categoryId,
    // ร้านที่ขายหลายภูมิภาคต้องใช้หมวดเวอร์ชัน 2 (TikTok ปฏิเสธ v1 ด้วย error ชัดเจน)
    category_version: "v2",
    main_images: [{ uri: input.imageUri }],
    package_weight: { value: String(input.weightGrams), unit: "GRAM" },
    skus: skus.map((sku) => ({
      seller_sku: sku.sellerSku,
      // ตามสคีมาของ TikTok: price = { amount, currency } (amount คือราคาขายจริงก่อนลด)
      price: { amount: sku.price.toFixed(2), currency: "THB" as const },
      inventory: [{ warehouse_id: input.warehouseId, quantity: sku.quantity }],
      ...(sku.sizeName
        ? { sales_attributes: [{ name: sizeAttributeName, value_name: sku.sizeName }] }
        : {}),
    })),
  };
}
