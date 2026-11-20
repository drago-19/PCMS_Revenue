// จัดรายการ "สต็อกกลาง" ให้เห็นแบบหน้า "สินค้า" ของ Shipnity:
// สินค้า 1 ตัว = แถวหลัก และรหัสกลาง (ไซส์) ของมันเรียงอยู่ใต้กัน
//
// กลุ่มของรหัสกลางใช้ product_id ของ "ประกาศที่ผูกอยู่" (ผ่าน central_stock_links)
// รหัสที่ยังไม่ผูกประกาศ = กลุ่มของตัวเอง
//
// ไฟล์นี้เป็นฟังก์ชันล้วน (ไม่ต่อฐานข้อมูล) เพื่อให้เทสต์ได้โดยไม่ต้องมี DB
// — ดู tests/central-stock-list.test.ts

import { variantHint, variantLabel } from "@/lib/platform/stock-list";

/** แถวที่อ่านมาจาก central_stock + ประกาศที่ผูก + ยอดจอง (ฟิลด์เท่าที่หน้ารายการใช้) */
export type CentralListSkuInput = {
  skuCode: string;
  productName: string | null;
  /** ยอดกลางที่ถูกหักตอนขายแล้ว (central_stock.on_hand) */
  onHand: number;
  /** ชิ้นที่อยู่ในออเดอร์ที่ร้านยังไม่ส่ง (ดูนิยาม UNSHIPPED ใน ops.ts) */
  reserved: number;
  listingCount: number;
  shopCount: number;
  imageUrl: string | null;
  hasImage: boolean;
  updatedAt: string;
  /** product_id ของประกาศที่ผูกกับรหัสนี้ — null เมื่อยังไม่ผูกประกาศ */
  productId: string | null;
  /** ชื่อไซส์จากประกาศ (platform_stock.variant_name) */
  variantName: string | null;
  /** ช่วงราคาของทุกประกาศที่ผูกกับรหัสนี้ — null เมื่อยังไม่มีราคา */
  price: { min: number; max: number } | null;
  currency: string | null;
};

export type CentralListSku = CentralListSkuInput & {
  /** คงเหลือ (ขายได้) = on_hand ตรง ๆ · ห้ามลบ reserved ซ้ำ (ดู availableOf) */
  available: number;
  /** รวมในมือ = on_hand + reserved · ใช้เทียบกับ Shipnity เท่านั้น ไม่ใช่ยอดที่ขายได้ */
  onHandTotal: number;
  /** ป้ายไซส์ที่แสดงบนแถวลูก — ชื่อจากประกาศ หรือ "ไซส์ X" จากท้ายรหัส หรือ "—" */
  variantText: string;
  /** คำอธิบายใต้ป้าย (tooltip) เมื่อป้ายไม่ได้มาจากชื่อไซส์จริง */
  variantHint: string | null;
};

export type CentralListGroup = {
  /** คีย์ของกลุ่ม: product_id ของประกาศ หรือ sku_code เมื่อรหัสนั้นยังไม่ผูกประกาศ */
  key: string;
  productId: string | null;
  productName: string | null;
  imageUrl: string | null;
  currency: string | null;
  /** ช่วงราคาของทุกประกาศในกลุ่ม (min = max เมื่อราคาเดียว) — null เมื่อยังไม่มีราคา */
  price: { min: number; max: number } | null;
  /** รหัสกลาง (ไซส์) ที่อยู่ในกลุ่มนี้ เรียงตามลำดับเดิมที่อ่านมา */
  skus: CentralListSku[];
  /** จำนวนรหัสย่อยในกลุ่ม */
  skuCount: number;
  totalReserved: number;
  /** ผลรวมทุกคอลัมน์ด้วยกติกาเดียวกับแถวลูก */
  totalAvailable: number;
  totalOnHand: number;
  /** จำนวนประกาศที่ผูกไว้ทั้งกลุ่ม และจำนวนร้านที่ไม่ซ้ำ */
  listingCount: number;
  shopCount: number;
};

/**
 * คงเหลือ (ขายได้) ของรหัสกลาง = central_stock.on_hand ตรง ๆ
 *
 * ห้ามเอา reserved มาลบซ้ำ (เหตุผลเดิมอยู่ใน src/lib/platform/stock-list.ts:66-87):
 * ยอดกลางถูกหักไปตั้งแต่ตอนขายแล้ว (reconcileCentralStock → applyDeductions) แล้วยอดที่ยังไม่ส่ง
 * ยังถูกนับเป็น "จอง" อีกชั้น — เอา on_hand − reserved จะกลายเป็นการหักสองรอบและติดลบทั้งที่ของมีอยู่
 * ติดลบได้เฉพาะเมื่อ on_hand ติดลบจริง (ปรับมือเกินของ): คืนค่าจริง ไม่ตัดเป็น 0 และไม่กลับเครื่องหมาย
 */
export function availableOf(row: Pick<CentralListSkuInput, "onHand">): number {
  return Math.trunc(row.onHand);
}

/**
 * รวมในมือ = on_hand + reserved · แสดงเป็น "ยอดรวมที่มีอยู่จริง" เพื่อเทียบกับ Shipnity เท่านั้น
 * ห้ามเอาไปใช้เป็น "คงเหลือที่ขายได้" — on_hand ถูกตัดยอดขายไปแล้ว จะกลายเป็นการนับซ้ำ
 */
export function onHandTotalOf(row: Pick<CentralListSkuInput, "onHand" | "reserved">): number {
  return Math.trunc(row.onHand) + Math.trunc(row.reserved);
}

/** รวมช่วงราคาสองช่วงเข้าด้วยกัน — ช่วงไหนไม่มีให้เอาอีกช่วง (null + null = null) */
export function mergePrice(
  a: { min: number; max: number } | null,
  b: { min: number; max: number } | null,
): { min: number; max: number } | null {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

/**
 * รวมแถวรหัสกลางเป็นกลุ่ม โดยคงลำดับที่อ่านมา (แถวแรกของแต่ละกลุ่มคือตำแหน่งของกลุ่ม)
 * แถวที่ยังไม่ผูกประกาศ (productId = null) ถือเป็นกลุ่มของตัวเอง — ไม่เอารหัสที่ยังไม่ผูกมารวมกัน
 */
export function groupCentralStockRows(rows: CentralListSkuInput[]): CentralListGroup[] {
  const groups = new Map<string, CentralListGroup>();

  for (const row of rows) {
    const key = row.productId ? `product:${row.productId}` : `sku:${row.skuCode}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        productId: row.productId,
        productName: row.productName,
        imageUrl: row.imageUrl,
        currency: row.currency,
        price: null,
        skus: [],
        skuCount: 0,
        totalReserved: 0,
        totalAvailable: 0,
        totalOnHand: 0,
        listingCount: 0,
        shopCount: 0,
      };
      groups.set(key, group);
    }

    // "คงเหลือ (ขายได้)" = on_hand ตรง ๆ · "รวมในมือ" = on_hand + reserved (ไม่หักซ้ำ)
    const available = availableOf(row);
    const onHandTotal = onHandTotalOf(row);
    group.skus.push({ ...row, available, onHandTotal, variantText: "", variantHint: null });
    group.totalReserved += row.reserved;
    group.totalAvailable += available;
    group.totalOnHand += onHandTotal;
    group.listingCount += row.listingCount;
    group.shopCount = Math.max(group.shopCount, row.shopCount);
    // ค่าที่ขาดหายของกลุ่มเติมจากรหัสลำดับถัดไป (แถวแรกของสินค้าอาจไม่มีรูป/ชื่อ/สกุลเงิน)
    if (!group.productName && row.productName) group.productName = row.productName;
    if (!group.imageUrl && row.imageUrl) group.imageUrl = row.imageUrl;
    if (!group.currency && row.currency) group.currency = row.currency;
    group.price = mergePrice(group.price, row.price);
  }

  for (const group of groups.values()) {
    group.skuCount = group.skus.length;
    // ป้ายไซส์ใช้ชื่อจากประกาศก่อน ไม่มีก็ใช้ท้ายรหัสกลางของแถวนั้น (K-5ORS-16-F → ไซส์ F)
    group.skus = group.skus.map((sku) => ({
      ...sku,
      variantText: variantLabel(sku.variantName, sku.skuCode),
      variantHint: variantHint(sku.variantName, sku.skuCode),
    }));
  }

  return [...groups.values()];
}
