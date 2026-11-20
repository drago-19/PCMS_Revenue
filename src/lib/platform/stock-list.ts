// จัดรายการสต็อกให้เห็นแบบหน้า "สินค้า" ของ Shipnity:
// สินค้า 1 ตัว = แถวหลัก และรหัสย่อย (ไซส์) ของมันเรียงอยู่ใต้กัน
//
// ไฟล์นี้เป็นฟังก์ชันล้วน (ไม่ต่อฐานข้อมูล) เพื่อให้เทสต์ได้โดยไม่ต้องมี DB
// — ดู tests/platform-stock-list.test.ts

/** แถวที่อ่านมาจาก platform_stock + ยอดจอง (ฟิลด์เท่าที่หน้ารายการใช้) */
export type StockListSkuInput = {
  skuId: string;
  sellerSku: string | null;
  variantName: string | null;
  price: number | null;
  currency: string | null;
  quantity: number;
  /** ชิ้นที่อยู่ในออเดอร์ที่ร้านยังไม่ส่ง (ดูนิยามใน stock.ts: reservedJoin) */
  reserved: number;
  productId: string | null;
  productName: string | null;
  imageUrl: string | null;
  productStatus: string | null;
};

export type StockListSku = StockListSkuInput & {
  /** คงเหลือ (ขายได้) = quantity ตามที่แพลตฟอร์มส่งมา · ห้ามลบ reserved ซ้ำ (ดู availableOf) */
  available: number;
  /** รวมในมือ = quantity + reserved · ใช้เทียบกับ Shipnity เท่านั้น ไม่ใช่ยอดที่ขายได้ */
  onHand: number;
};

export type StockListGroup = {
  /** คีย์ของกลุ่ม: product_id หรือ sku_id เมื่อแถวนั้นไม่มีรหัสสินค้าหลัก */
  key: string;
  productId: string | null;
  productName: string | null;
  imageUrl: string | null;
  productStatus: string | null;
  currency: string | null;
  /** ช่วงราคาของทุกไซส์ในช่วงที่เห็น (min = max เมื่อราคาเดียว) — null เมื่อยังไม่มีราคา */
  price: { min: number; max: number } | null;
  /** รหัสย่อยที่อยู่ในรายการชุดนี้ เรียงตามลำดับเดิมที่อ่านมา */
  skus: StockListSku[];
  /** จำนวนรหัสย่อยของสินค้านี้ทั้งร้าน — มากกว่า skus.length ได้เมื่ออีกไซส์อยู่หน้าถัดไป */
  skuTotal: number;
  totalStock: number;
  totalReserved: number;
  /** ผลรวม "คงเหลือ (ขายได้)" ของไซส์ในกลุ่ม — กติกาเดียวกับ availableOf */
  totalAvailable: number;
  /** ผลรวม "รวมในมือ" (quantity + reserved) ของไซส์ในกลุ่ม */
  totalOnHand: number;
};

/**
 * ชื่อตัวเลือก/ไซส์จาก TikTok (skus[].sales_attributes) — ใช้ value_name เป็นหลัก ถือ name เป็นรอง
 * คืนสตริงว่างเมื่อไม่มีข้อมูล: ฝั่งซิงก์ใช้ค่าว่างแปลว่า "ขอรายละเอียดแล้วแต่สินค้านี้ไม่มีตัวเลือก"
 * ห้ามเดาไซส์จากรหัส SKU
 */
export function variantNameFromSalesAttributes(
  attributes: Array<{ name?: string | null; value_name?: string | null }> | null | undefined,
): string {
  const parts = (attributes ?? [])
    .map((attribute) => (attribute.value_name ?? "").trim() || (attribute.name ?? "").trim())
    .filter((part) => part.length > 0);
  return parts.join(" / ");
}

/**
 * คงเหลือ (ขายได้) ของรหัสย่อย = quantity ตามที่แพลตฟอร์มส่งมาตรง ๆ
 *
 * ห้ามเอา reserved มาลบซ้ำ (เดิมมี remainingOf = quantity − reserved และทำให้ขึ้นค่าติดลบ):
 * platform_stock.quantity ที่ซิงก์จาก TikTok คือยอดที่ขายได้แล้ว (ตัดออเดอร์ที่ยังไม่ส่งออกไปแล้ว)
 * ไม่ใช่ยอดรวมในมือ — หลักฐานจากหน้าจริง:
 *   - K-14PLS-2 quantity 125, จอง 0 → ตรงกับ Shipnity 125
 *   - K-6TL-134 quantity 48 + จอง 190 = 238 → ใกล้เคียงยอดในมือ Shipnity 248
 *     (ถ้าเอา 48 − 190 จะได้ −142 ซึ่งไม่มีอยู่จริง — หักสองรอบ)
 * ติดลบได้เฉพาะเมื่อ API ส่ง quantity ติดลบมาจริง: คืนค่าจริง ไม่ตัดเป็น 0 และไม่กลับเครื่องหมาย
 */
export function availableOf(row: Pick<StockListSkuInput, "quantity">): number {
  return Math.trunc(row.quantity);
}

/**
 * รวมในมือ = quantity + reserved · แสดงเป็น "ยอดรวมที่มีอยู่จริง" เพื่อเทียบกับ Shipnity เท่านั้น
 * ห้ามเอาไปใช้เป็น "คงเหลือที่ขายได้" — quantity ถูกตัดยอดขายไปแล้ว จะกลายเป็นการหักสองรอบ
 */
export function onHandOf(row: Pick<StockListSkuInput, "quantity" | "reserved">): number {
  return Math.trunc(row.quantity) + Math.trunc(row.reserved);
}

/** ส่วนท้ายของรหัส SKU หลังขีดสุดท้าย (K-5ORS-16-F → F) — คืน "" เมื่อรหัสไม่มีขีดต่อท้าย */
function variantTail(sellerSku: string | null): string {
  const code = (sellerSku ?? "").trim();
  const dash = code.lastIndexOf("-");
  return dash >= 0 ? code.slice(dash + 1).trim() : "";
}

/** ไซส์ที่ยอมรับให้เดาจากรหัสได้ — รหัสที่มีท้ายอื่น (เช่น K-6TL-96) ไม่ใช่ไซส์ ห้ามเดา */
const KNOWN_SIZE_SUFFIXES = new Set([
  "f",
  "p",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "xxxl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "free",
  "plus",
]);

/** ส่วนท้ายรหัสที่เป็นไซส์จริง (K-5ORS-16-F → F, K-5ORS-16-2xl → 2xl) · คืน null เมื่อไม่ใช่ไซส์ที่รู้จัก */
function knownSizeTail(sellerSku: string | null): string | null {
  const tail = variantTail(sellerSku);
  return tail && KNOWN_SIZE_SUFFIXES.has(tail.toLowerCase()) ? tail : null;
}

/**
 * ป้ายไซส์ของแถวลูก
 * - มี variant_name จากแพลตฟอร์ม = ใช้ค่านั้น
 * - ไม่มี แต่ท้ายรหัสตรงกับไซส์ที่รู้จัก (K-5ORS-16-F → "ไซส์ F") = ใช้ท้ายรหัสเป็นป้ายชั่วคราว
 *   พร้อม variantHint บอกว่าชื่อจริงจะขึ้นหลังซิงก์รอบถัดไป
 * - รหัสไม่มีขีด หรือท้ายรหัสไม่ใช่ไซส์ (K-6TL-96) = "—" (สินค้านี้ไม่มีตัวเลือก) — ห้ามเดาว่าเลขท้ายคือไซส์
 */
export function variantLabel(variantName: string | null, sellerSku: string | null): string {
  const value = (variantName ?? "").trim();
  if (value) return value;
  const tail = knownSizeTail(sellerSku);
  return tail ? `ไซส์ ${tail}` : "—";
}

/** คำอธิบายใต้ป้ายไซส์ (tooltip) — null เมื่อเป็นชื่อไซส์จริงจากแพลตฟอร์มแล้ว */
export function variantHint(variantName: string | null, sellerSku: string | null): string | null {
  if ((variantName ?? "").trim()) return null;
  return knownSizeTail(sellerSku) ? "ชื่อไซส์จริงจะขึ้นหลังซิงก์รอบถัดไป" : "สินค้านี้ไม่มีตัวเลือก";
}

/**
 * แถวออเดอร์ในป๊อปอัปรายละเอียด SKU (รูปร่างเดียวกับ SkuOrderRow ใน stock.ts)
 * เก็บไว้ที่นี่เพราะเป็นฟังก์ชันล้วนที่เทสต์ได้ — stock.ts ต่อฐานข้อมูลจึงเทสต์ไม่ได้
 */
export type SkuOrderLike = {
  orderId: string;
  quantity: number;
  orderedAt: string;
  status: string;
};

/**
 * รวมแถวออเดอร์ที่เลขออเดอร์ซ้ำให้เหลือแถวเดียว (บวกจำนวนเข้าด้วยกัน คงลำดับเดิม)
 *
 * คิวรีใน stock.ts จัดกลุ่มให้แล้ว (หนึ่งแถวต่อหนึ่งออเดอร์) แต่หน้ารายละเอียดยังต้องกันซ้ำอีกชั้น:
 * ถ้าข้อมูลจากที่ใดก็ตามมีเลขออเดอร์ซ้ำ React จะฟ้อง "two children with the same key" และป๊อปอัปพังทั้งใบ
 */
export function mergeDuplicateOrders<T extends SkuOrderLike>(orders: T[]): T[] {
  const merged = new Map<string, T>();
  for (const order of orders) {
    const current = merged.get(order.orderId);
    if (!current) {
      merged.set(order.orderId, { ...order });
      continue;
    }
    current.quantity += order.quantity;
  }
  return [...merged.values()];
}

/** ยอดรวมของสินค้าทั้งตัว (ทุกไซส์ในร้าน) — ใช้แทนยอดของเฉพาะรหัสที่อยู่ในหน้าปัจจุบัน */
export type StockListProductTotal = {
  stock: number;
  reserved: number;
  skus: number;
  price: { min: number; max: number } | null;
};

/**
 * รวมแถว SKU เป็นกลุ่มตาม product_id โดยคงลำดับที่อ่านมา (แถวแรกของแต่ละสินค้าคือตำแหน่งของกลุ่ม)
 * แถวที่ไม่มี product_id ถือเป็นสินค้าของตัวเอง (กลุ่มละ 1 รหัสย่อย)
 * productTotals: ยอดรวมทั้งสินค้าจากฐานข้อมูล — ใส่แล้วแถวหลักจะแสดงยอดของทุกไซส์
 * แม้บางไซส์จะไม่ได้อยู่ในหน้านี้
 */
export function groupStockRows(
  rows: StockListSkuInput[],
  productTotals: Record<string, StockListProductTotal> = {},
): StockListGroup[] {
  const groups = new Map<string, StockListGroup>();

  for (const row of rows) {
    const key = row.productId ? `product:${row.productId}` : `sku:${row.skuId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        productId: row.productId,
        productName: row.productName,
        imageUrl: row.imageUrl,
        productStatus: row.productStatus,
        currency: row.currency,
        price: null,
        skus: [],
        skuTotal: 0,
        totalStock: 0,
        totalReserved: 0,
        totalAvailable: 0,
        totalOnHand: 0,
      };
      groups.set(key, group);
    }

    // "คงเหลือ (ขายได้)" = quantity ตรง ๆ · "รวมในมือ" = quantity + reserved (ไม่หักซ้ำ)
    const available = availableOf(row);
    const onHand = onHandOf(row);
    group.skus.push({ ...row, available, onHand });
    group.totalStock += row.quantity;
    group.totalReserved += row.reserved;
    group.totalAvailable += available;
    group.totalOnHand += onHand;
    // ค่าที่ขาดหายของกลุ่มเติมจากไซส์ลำดับถัดไป (แถวแรกของสินค้าอาจไม่มีรูป/ชื่อ)
    if (!group.productName && row.productName) group.productName = row.productName;
    if (!group.imageUrl && row.imageUrl) group.imageUrl = row.imageUrl;
    if (!group.currency && row.currency) group.currency = row.currency;
    // สถานะของสินค้า: ถ้ามีไซส์ไหนเปิดขายอยู่ ตัวหลักถือว่าเปิดขาย
    if (row.productStatus === "ACTIVATE") group.productStatus = "ACTIVATE";
    if (row.price !== null) {
      group.price = group.price
        ? { min: Math.min(group.price.min, row.price), max: Math.max(group.price.max, row.price) }
        : { min: row.price, max: row.price };
    }
  }

  for (const group of groups.values()) {
    const total = group.productId ? productTotals[group.productId] : undefined;
    group.skuTotal = Math.max(group.skus.length, total?.skus ?? 0);
    if (total) {
      // แถวหลัก = ยอดรวมของทุกไซส์ (ไม่ใช่เฉพาะไซส์ที่อยู่ในหน้านี้)
      group.totalStock = total.stock;
      group.totalReserved = total.reserved;
      // แถวหลักสรุปด้วยกติกาเดียวกับแถวลูก: ผลรวมแต่ละคอลัมน์
      group.totalAvailable = availableOf({ quantity: total.stock });
      group.totalOnHand = onHandOf({ quantity: total.stock, reserved: total.reserved });
      if (total.price) group.price = total.price;
    }
  }

  return [...groups.values()];
}
