// สต็อกจาก TikTok โดยตรง (ไม่ผ่าน Shipnity)
// - ดึงจำนวนคงเหลือต่อ SKU ด้วยการค้นหาสินค้าครั้งเดียว (search ส่ง inventory มาด้วย)
// - เก็บยอดล่าสุดไว้เทียบ และบันทึกประวัติเมื่อยอดเปลี่ยน
// - ยังอ่านอย่างเดียว: การเขียนกลับต้องได้สิทธิ์ Product (write) จาก TikTok ก่อน

import { query, runWithCompany } from "@/lib/db";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  getShopCompany,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import { callTikTokApi } from "@/lib/platform/tiktok";

type ApiSku = {
  id?: string;
  seller_sku?: string;
  inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
};

type ApiProduct = {
  id?: string;
  title?: string;
  skus?: ApiSku[];
};

export type StockRow = {
  skuId: string;
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
  updatedAt: string;
  /** รูปสินค้าที่เราเก็บไว้กับสต็อก (ดึงจาก TikTok ตอนซิงก์) */
  imageUrl: string | null;
  /** ชิ้นที่ลูกค้าส่งคืนแล้วแต่ยังไม่ถึงร้าน — ไม่ควรนับเป็นของพร้อมขาย */
  inTransit: number;
  /** สถานะวางขายบน TikTok — ACTIVATE = เปดตะกร้า, SELLER_DEACTIVATED = ซ่อนตะกร้า */
  productStatus: string | null;
};

/** ป้ายสถานะวางขายที่ใช้ร่วมกันทั้งตารางรายการและป๊อปอัป */
export function productStatusLabel(status: string | null): string {
  if (status === "ACTIVATE") return "เปิดตะกร้า";
  if (status === "SELLER_DEACTIVATED") return "ซ่อนตะกร้า";
  if (status === "PLATFORM_DEACTIVATED") return "ถูกระงับโดยแพลตฟอร์ม";
  if (status === "DRAFT") return "แบบร่าง";
  if (status === "PENDING") return "รอตรวจ";
  if (status === "FAILED") return "ไม่ผ่านการตรวจ";
  if (status === "DELETED") return "ลบแล้ว";
  if (status === "FREEZE") return "ถูกพักการขาย";
  return status ?? "ไม่ทราบสถานะ";
}

export type StockMovement = {
  sellerSku: string | null;
  productName: string | null;
  fromQty: number | null;
  toQty: number;
  delta: number;
  changedAt: string;
};

const PAGE_SIZE = 100;

/**
 * ดึงสต็อกล่าสุดจาก TikTok แล้วบันทึกยอด + ประวัติเมื่อเปลี่ยน
 * ร้านอาจสังกัดบริษัทอื่น — ข้อมูลจึงถูกเขียนลง schema ของบริษัทที่ร้านอยู่
 */
export async function syncStock(shopId: string): Promise<{ skus: number; changed: number; error?: string }> {
  const company = await getShopCompany(shopId).catch(() => "dragon19" as const);
  return runWithCompany(company, () => syncStockInner(shopId));
}

async function syncStockInner(shopId: string): Promise<{ skus: number; changed: number; error?: string }> {
  const config = await getPlatformConfig();
  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!config.tiktok || !account?.accessToken || !account.shopCipher) {
    return { skus: 0, changed: 0, error: "ยังไม่มีสิทธิ์เชื่อมต่อร้านนี้" };
  }

  let pageToken: string | undefined;
  const collected: Array<{
    skuId: string;
    productId: string | null;
    sellerSku: string | null;
    productName: string | null;
    quantity: number;
    warehouses: Array<{ warehouseId: string; quantity: number }>;
    /** สถานะวางขายจากผลค้นหา — ชุดเดียวกับที่ใช้แสดงผล ไม่ต้องยิงขอรายละเอียดเพิ่ม */
    status: string | null;
  }> = [];

  try {
    for (let page = 0; page < 20; page += 1) {
      const response = await callTikTokApi<{
        products?: Array<ApiProduct & { status?: string }>;
        next_page_token?: string;
      }>({
        config: config.tiktok,
        accessToken: account.accessToken,
        path: "/product/202309/products/search",
        method: "POST",
        query: {
          shop_cipher: account.shopCipher,
          page_size: String(PAGE_SIZE),
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: { page_size: PAGE_SIZE, ...(pageToken ? { page_token: pageToken } : {}) },
      });

      for (const product of response.products ?? []) {
        for (const sku of product.skus ?? []) {
          if (!sku.id) continue;
          const warehouses = (sku.inventory ?? []).map((item) => ({
            warehouseId: String(item.warehouse_id ?? ""),
            quantity: Number(item.quantity ?? 0),
          }));
          collected.push({
            skuId: sku.id,
            productId: product.id ?? null,
            sellerSku: sku.seller_sku ?? null,
            productName: product.title ?? null,
            quantity: warehouses.reduce((sum, item) => sum + item.quantity, 0),
            warehouses,
            status: product.status ?? null,
          });
        }
      }

      pageToken = response.next_page_token;
      if (!pageToken) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดึงสต็อกไม่สำเร็จ";
    console.error("[stock-sync] ดึงสต็อกจาก TikTok ไม่สำเร็จ", shopId, message);
    return { skus: 0, changed: 0, error: message.slice(0, 240) };
  }

  if (collected.length === 0) return { skus: 0, changed: 0 };

  // บันทึกประวัติก่อนเขียนยอดใหม่: ใส่แถวเฉพาะที่ฐานข้อมูลยังมียอดเดิมอยู่จริง
  // ถ้าอีกทาง (กดปรับสต็อก) บันทึกการเปลี่ยนเดียวกันไปก่อนแล้ว จะไม่มีแถวซ้ำสองแถว
  // ใช้ยอดที่อยู่ในฐานข้อมูล ณ ตอนบันทึกเป็น "ยอดเดิม" ไม่ใช่ค่าที่อ่านค้างไว้ตอนต้นรอบ
  const recorded = await query<{ sku_id: string }>(
    `INSERT INTO platform_stock_movements (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
     SELECT $1, $2, item.sku_id, item.seller_sku, item.product_name, s.quantity, item.quantity, item.quantity - s.quantity
       FROM unnest($3::text[], $4::text[], $5::text[], $6::int[])
            AS item(sku_id, seller_sku, product_name, quantity)
       JOIN platform_stock s
         ON s.platform = $1 AND s.shop_id = $2 AND s.sku_id = item.sku_id
      WHERE s.quantity <> item.quantity
     RETURNING sku_id`,
    [
      TIKTOK_PLATFORM,
      shopId,
      collected.map((item) => item.skuId),
      collected.map((item) => item.sellerSku),
      collected.map((item) => item.productName),
      collected.map((item) => item.quantity),
    ],
  );

  // เขียนครั้งเดียวทั้งชุด (ไม่วนคิวรีต่อแถว)
  await query(
    `INSERT INTO platform_stock (platform, shop_id, sku_id, product_id, seller_sku, product_name, quantity, warehouses, product_status, updated_at)
     SELECT $1, $2, item.sku_id, item.product_id, item.seller_sku, item.product_name, item.quantity, item.warehouses::jsonb, item.status, now()
       FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[])
            AS item(sku_id, product_id, seller_sku, product_name, quantity, warehouses, status)
     ON CONFLICT (shop_id, sku_id) DO UPDATE
       SET platform = EXCLUDED.platform,
           product_id = EXCLUDED.product_id,
           seller_sku = EXCLUDED.seller_sku,
           -- สถานะวางขายจากผลค้นหา: อัปเดตทุกครั้งที่ซิงก์ (เดิมขอเฉพาะสินค้าที่ยังไม่มีข้อมูล สถานะจึงค้าง)
           product_status = COALESCE(EXCLUDED.product_status, platform_stock.product_status),
           -- ชื่อ/รูปที่ฝ่ายขายเพิ่งแก้: ห้ามซิงก์เขียนทับด้วยค่าจาก TikTok ที่ยังไม่ตาม (10 นาที)
           product_name = CASE WHEN platform_stock.name_locked_until > now()
                               THEN platform_stock.product_name ELSE EXCLUDED.product_name END,
           quantity = EXCLUDED.quantity,
           warehouses = EXCLUDED.warehouses,
           updated_at = now()`,
    [
      TIKTOK_PLATFORM,
      shopId,
      collected.map((item) => item.skuId),
      collected.map((item) => item.productId),
      collected.map((item) => item.sellerSku),
      collected.map((item) => item.productName),
      collected.map((item) => item.quantity),
      collected.map((item) => JSON.stringify(item.warehouses)),
      collected.map((item) => item.status),
    ],
  );

  // รายละเอียดสินค้า: ผลค้นหาไม่ส่งรูป/หมวดหมู่/ราคามา ต้องขอทีละสินค้า
  // (สถานะวางขายได้จากผลค้นหาแล้ว จึงใช้ผลค้นหาเป็นแหล่งของสถานะทุกครั้ง)
  // ขอเฉพาะสินค้าที่ยังไม่มีข้อมูล — ครั้งแรกของแต่ละสินค้าเท่านั้น ไม่ใช่ทุกรอบ
  const productIds = [...new Set(collected.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
  const haveMeta = await query<{ product_id: string }>(
    `SELECT DISTINCT product_id FROM platform_stock
      WHERE platform = $1 AND shop_id = $2
        AND coalesce(image_url, '') <> '' AND product_status IS NOT NULL AND category_id IS NOT NULL`,
    [TIKTOK_PLATFORM, shopId],
  );
  const withMeta = new Set(haveMeta.map((row) => row.product_id));
  const needMeta = productIds.filter((id) => !withMeta.has(id)).slice(0, 200);

  type DetailPayload = {
    status?: string;
    category_chains?: Array<{ id?: string; local_name?: string; name?: string; is_leaf?: boolean }>;
    main_images?: Array<{ thumb_urls?: string[]; uri?: string }>;
    skus?: Array<{
      id?: string;
      price?: {
        tax_exclusive?: { currency?: string; sale_price?: string };
        sale_price?: string;
        currency?: string;
        pre_sale?: { type?: string; fulfillment_type?: { handling_duration_days?: number; release_date?: number } };
      };
    }>;
  };

  if (needMeta.length > 0) {
    const found: Array<{
      productId: string;
      imageUrl: string | null;
      status: string | null;
      category: string | null;
      categoryId: string | null;
      prices: Array<{ skuId: string; price: string | null; currency: string | null; preSaleType: string | null }>;
    }> = [];

    for (let index = 0; index < needMeta.length; index += 3) {
      const batch = needMeta.slice(index, index + 3);
      const results = await Promise.all(
        batch.map(async (productId) => {
          try {
            const detail = await callTikTokApi<DetailPayload>({
              config: config.tiktok!,
              accessToken: account.accessToken!,
              path: `/product/202309/products/${productId}`,
              query: { shop_cipher: account.shopCipher! },
            });
            const image = detail.main_images?.[0]?.thumb_urls?.[0] ?? detail.main_images?.[0]?.uri ?? null;
            const category =
              (detail.category_chains ?? [])
                .map((chain) => chain.local_name ?? chain.name ?? "")
                .filter(Boolean)
                .join(" › ") || null;
            const categoryId =
              [...(detail.category_chains ?? [])].reverse().find((chain) => chain.id)?.id ?? null;
            const prices = (detail.skus ?? []).flatMap((sku) => {
              if (!sku.id) return [];
              const price = sku.price?.tax_exclusive?.sale_price ?? sku.price?.sale_price ?? null;
              const currency = sku.price?.tax_exclusive?.currency ?? sku.price?.currency ?? null;
              return [{ skuId: String(sku.id), price, currency, preSaleType: sku.price?.pre_sale?.type ?? null }];
            });
            return { productId, imageUrl: image, status: detail.status ?? null, category, categoryId, prices };
          } catch {
            return null;
          }
        }),
      );
      for (const result of results) if (result) found.push(result);
    }

    if (found.length > 0) {
      await query(
        `UPDATE platform_stock s
            SET image_url = CASE WHEN s.image_locked_until > now() THEN s.image_url ELSE coalesce(item.image_url, s.image_url) END,
                product_status = coalesce(item.status, s.product_status),
                category = coalesce(item.category, s.category),
                category_id = coalesce(item.category_id, s.category_id)
           FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
                AS item(product_id, image_url, status, category, category_id)
          WHERE s.platform = $1 AND s.shop_id = $2 AND s.product_id = item.product_id`,
        [
          TIKTOK_PLATFORM,
          shopId,
          found.map((item) => item.productId),
          found.map((item) => item.imageUrl),
          found.map((item) => item.status),
          found.map((item) => item.category),
          found.map((item) => item.categoryId),
        ],
      );

      const priced = found.flatMap((item) =>
        item.prices
          .filter((row) => row.price !== null || row.currency !== null)
          .map((row) => ({ ...row })),
      );
      if (priced.length > 0) {
        await query(
          `UPDATE platform_stock s
              SET price = nullif(item.price, '')::numeric,
                  currency = nullif(item.currency, ''),
                  pre_sale_type = nullif(item.pre_sale_type, '')
             FROM unnest($3::text[], $4::text[], $5::text[], $6::text[]) AS item(sku_id, price, currency, pre_sale_type)
            WHERE s.platform = $1 AND s.shop_id = $2 AND s.sku_id = item.sku_id`,
          [
            TIKTOK_PLATFORM,
            shopId,
            priced.map((row) => row.skuId),
            priced.map((row) => row.price ?? ""),
            priced.map((row) => row.currency ?? ""),
            priced.map((row) => row.preSaleType ?? ""),
          ],
        );
      }
    }
  }

  // บันทึกรอบที่ดึงสำเร็จ เพื่อให้หน้าจอแสดง "ดึงล่าสุดเมื่อไร" ได้จริง
  // แม้รอบนั้นไม่มีค่าไหนเปลี่ยน (ไม่เช่นนั้นเวลาจะค้างอยู่ที่การเปลี่ยนครั้งสุดท้าย)
  await query(
    `INSERT INTO platform_sync_runs (platform, kind, status, rows_written, started_at, finished_at)
     VALUES ($1, 'stock', 'done', $2, now(), now())`,
    [TIKTOK_PLATFORM, recorded.length],
  );

  return { skus: collected.length, changed: recorded.length };
}

/** ตัวกรองของหน้าสต็อก — ใช้เป็นคีย์สั้น ๆ ใน URL */
export type StockListFilter = "all" | "out" | "low" | "open" | "hidden" | "deleted";

/** เกณฑ์ "ใกล้หมด" — เหลือไม่เกิน 5 ชิ้น */
export const LOW_STOCK_THRESHOLD = 5;

// หน้าสต็อกอ่านเฉพาะตารางของแพลตฟอร์ม — ไม่ผูกกับทะเบียนสินค้าหรือต้นทุนของระบบเรา
const STOCK_FROM = `FROM platform_stock s`;

// สถานะคำขอคืนที่ถือว่า "ของออกจากมือลูกค้าแล้วแต่ยังไม่ถึงร้าน"
// ไม่นับ REFUND (ลูกค้าเก็บของไว้) และไม่นับ REPLACEMENT/EXCHANGE (มีออเดอร์ใหม่แทน)
// ไม่นับ *_REQUEST_COMPLETE เพราะเป็นสถานะจบ (คืนเงินจบแล้ว) — ถ้านับด้วย ของคืนเก่าหลายเดือน
// จะค้างอยู่ในยอดตลอดไป ทำให้ตัวเลขบนหน้าสต็อกพองเกินจริง
export const IN_TRANSIT_RETURN_STATUSES = ["BUYER_SHIPPED_ITEM", "RETURN_OR_REFUND_REQUEST_SUCCESS"];

/** ยอดกำลังตีกลับต่อ SKU — จำนวนต่อแถวอาจไม่ถูกส่งมาในบางเวอร์ชัน จึงถอยไปใช้จำนวนในรายการออเดอร์ */
function inTransitJoin(statusParam: string): string {
  return `LEFT JOIN (
    SELECT i.platform, i.shop_id, i.sku_id,
           sum(COALESCE(NULLIF(i.quantity, 0), oi.quantity, 0))::int AS in_transit
      FROM platform_return_items i
      JOIN platform_returns r
        ON r.platform = i.platform AND r.shop_id = i.shop_id AND r.return_id = i.return_id
      LEFT JOIN platform_order_items oi
        ON oi.platform = i.platform AND oi.shop_id = i.shop_id
       AND oi.order_id = r.order_id AND oi.line_item_id = i.order_line_item_id
     WHERE i.platform = $1 AND i.shop_id = $2
       AND r.return_type = 'RETURN_AND_REFUND'
       AND r.return_status = ANY(${statusParam}::text[])
     GROUP BY i.platform, i.shop_id, i.sku_id
  ) rt
    ON rt.platform = s.platform AND rt.shop_id = s.shop_id AND rt.sku_id = s.sku_id`;
}

const STOCK_FILTER_SQL: Record<Exclude<StockListFilter, "all">, string> = {
  out: "s.quantity <= 0",
  low: `s.quantity > 0 AND s.quantity <= ${LOW_STOCK_THRESHOLD}`,
  open: "s.product_status = 'ACTIVATE'",
  // ซ่อนตะกร้า = ผู้ขายปิดขายเอง (ไม่นับสินค้าที่ถูกลบ/รอตรวจ/ไม่ผ่านการตรวจ)
  hidden: "s.product_status = 'SELLER_DEACTIVATED'",
  // ไม่พร้อมขาย = สถานะอื่นทั้งหมดที่เหลือ (ลบแล้ว · รอตรวจ · ไม่ผ่านการตรวจ · ไม่ทราบสถานะ)
  deleted: "s.product_status IS NULL OR s.product_status NOT IN ('ACTIVATE', 'SELLER_DEACTIVATED')",
};

/** กัน % _ และ backslash ไม่ให้คำค้นของผู้ใช้กลายเป็นไวลด์การ์ด */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

type StockRowDb = {
  sku_id: string;
  seller_sku: string | null;
  product_name: string | null;
  quantity: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
  updated_at: string;
  stock_image: string | null;
  in_transit: number;
  product_status: string | null;
};

function toStockRow(row: StockRowDb): StockRow {
  return {
    skuId: row.sku_id,
    sellerSku: row.seller_sku,
    productName: row.product_name,
    quantity: Number(row.quantity ?? 0),
    inTransit: Number(row.in_transit ?? 0),
    warehouses: row.warehouses ?? [],
    updatedAt: row.updated_at,
    imageUrl: row.stock_image,
    productStatus: row.product_status,
  };
}

export type StockCounts = {
  all: number;
  out: number;
  low: number;
  /** สินค้าที่ยังเปิดตะกร้าขายอยู่ */
  open: number;
  /** สินค้าที่ผู้ขายซ่อนตะกร้าเอง (SELLER_DEACTIVATED) */
  hidden: number;
  /** สินค้าที่ไม่พร้อมขาย: ลบแล้ว · รอตรวจ · ไม่ผ่านการตรวจ · ไม่ทราบสถานะ */
  deleted: number;
  quantity: number;
  /** ชิ้นที่กำลังเดินกลับร้าน — ยังไม่ควรนับเป็นของพร้อมขาย */
  inTransit: number;
};

/** นับของทั้งร้านในคำสั่งเดียว — หน้าเว็บไม่ต้องดึงทุกแถวมาบวกรวมเอง */
export async function getStockCounts(shopId: string, platform = TIKTOK_PLATFORM): Promise<StockCounts> {
  const params: unknown[] = [platform, shopId];
  const join = inTransitJoin(`$${params.length + 1}`);
  params.push([...IN_TRANSIT_RETURN_STATUSES]);

  const rows = await query<{
    all: number;
    out: number;
    low: number;
    open: number;
    hidden: number;
    deleted: number;
    quantity: number;
    in_transit: number;
  }>(
    `SELECT count(*)::int AS all,
            count(*) FILTER (WHERE s.quantity <= 0)::int AS out,
            count(*) FILTER (WHERE s.quantity > 0 AND s.quantity <= ${LOW_STOCK_THRESHOLD})::int AS low,
            count(*) FILTER (WHERE s.product_status = 'ACTIVATE')::int AS open,
            count(*) FILTER (WHERE s.product_status = 'SELLER_DEACTIVATED')::int AS hidden,
            count(*) FILTER (
              WHERE s.product_status IS NULL
                 OR s.product_status NOT IN ('ACTIVATE', 'SELLER_DEACTIVATED')
            )::int AS deleted,
            COALESCE(sum(s.quantity), 0)::int AS quantity,
            COALESCE(sum(rt.in_transit), 0)::int AS in_transit
       ${STOCK_FROM}
       ${join}
      WHERE s.platform = $1 AND s.shop_id = $2`,
    params as never[],
  );
  const row = rows[0];
  return {
    all: Number(row?.all ?? 0),
    out: Number(row?.out ?? 0),
    low: Number(row?.low ?? 0),
    open: Number(row?.open ?? 0),
    hidden: Number(row?.hidden ?? 0),
    deleted: Number(row?.deleted ?? 0),
    quantity: Number(row?.quantity ?? 0),
    inTransit: Number(row?.in_transit ?? 0),
  };
}

/**
 * หน้ารายการสต็อก: ค้นหา + กรอง + แบ่งหน้า ทำในฐานข้อมูลทั้งหมด
 * ใช้ LIMIT/OFFSET ได้เพราะ SKU ของร้านหนึ่งจำกัดตามแคตตาล็อก (หลักพัน–แสน)
 * ต่างจากตารางออเดอร์ที่เป็นอนุกรมเวลาและโตไม่หยุด ซึ่งใช้ keyset
 */
export async function getStockPage(
  shopId: string,
  options: { search?: string; filter?: StockListFilter; page?: number; pageSize?: number; platform?: string } = {},
): Promise<{ rows: StockRow[]; total: number }> {
  const platform = options.platform ?? TIKTOK_PLATFORM;
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const params: unknown[] = [platform, shopId];
  const where = ["s.platform = $1", "s.shop_id = $2"];

  const search = options.search?.trim();
  if (search) {
    params.push(`%${escapeLike(search)}%`);
    where.push(
      `(s.seller_sku ILIKE $${params.length} ESCAPE '\\' OR s.product_name ILIKE $${params.length} ESCAPE '\\'
        OR s.sku_id ILIKE $${params.length} ESCAPE '\\')`,
    );
  }
  if (options.filter && options.filter !== "all") where.push(STOCK_FILTER_SQL[options.filter]);

  const clause = where.join(" AND ");
  const totals = await query<{ total: number }>(
    `SELECT count(*)::int AS total ${STOCK_FROM} WHERE ${clause}`,
    params as never[],
  );
  const join = inTransitJoin(`$${params.length + 1}`);
  params.push([...IN_TRANSIT_RETURN_STATUSES]);

  const rows = await query<StockRowDb>(
    `SELECT s.sku_id, s.seller_sku, s.product_name, s.quantity, s.warehouses, s.updated_at::text AS updated_at,
            s.image_url AS stock_image, s.product_status, COALESCE(rt.in_transit, 0)::int AS in_transit
       ${STOCK_FROM}
       ${join}
      WHERE ${clause}
      -- ของที่ยังเปิดตะกร้าขึ้นก่อน แล้วค่อยเรียงตามจำนวนคงเหลือ
      ORDER BY (s.product_status = 'ACTIVATE') DESC NULLS LAST, s.quantity DESC, s.seller_sku ASC, s.sku_id ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params as never[],
  );

  return { rows: rows.map(toStockRow), total: Number(totals[0]?.total ?? 0) };
}

/** แถวประวัติ + id ของแถว (ใช้เป็นตัวต่อหน้าแบบ keyset) */
export type StockMovementRow = StockMovement & { id: string };

export type StockMovementCursor = { changedAt: string; id: string; back?: boolean };

/**
 * ประวัติการเปลี่ยนสต็อกของร้าน ทีละหน้าแบบ keyset (เวลา + id)
 * ไม่ใช้ OFFSET เพราะตารางนี้โตตลอดและหน้าลึกจะช้าลงเรื่อย ๆ
 */
/** จำนวนชิ้นของ SKU หนึ่งที่ลูกค้าส่งคืนแล้วแต่ยังไม่ถึงร้าน */
export async function getInTransitQty(
  shopId: string,
  skuId: string,
  platform = TIKTOK_PLATFORM,
): Promise<number> {
  const rows = await query<{ qty: number }>(
    `SELECT COALESCE(sum(COALESCE(NULLIF(i.quantity, 0), oi.quantity, 0)), 0)::int AS qty
       FROM platform_return_items i
       JOIN platform_returns r
         ON r.platform = i.platform AND r.shop_id = i.shop_id AND r.return_id = i.return_id
       LEFT JOIN platform_order_items oi
         ON oi.platform = i.platform AND oi.shop_id = i.shop_id
        AND oi.order_id = r.order_id AND oi.line_item_id = i.order_line_item_id
      WHERE i.platform = $1 AND i.shop_id = $2 AND i.sku_id = $3
        AND r.return_type = 'RETURN_AND_REFUND'
        AND r.return_status = ANY($4::text[])`,
    [platform, shopId, skuId, [...IN_TRANSIT_RETURN_STATUSES]],
  );
  return Number(rows[0]?.qty ?? 0);
}

/** สรุปความเคลื่อนไหวสต็อก: รอบ 5 นาทีล่าสุด (ใช้บนปุ่ม) + ยอดของวันนี้ (ใช้เป็นสัญญาณแจ้งเตือน) */
export async function getStockChangeStats({
  platform = TIKTOK_PLATFORM,
  shopId,
}: {
  platform?: string;
  shopId: string;
}): Promise<{ changes: number; added: number; removed: number; latest: string | null; today: number }> {
  const rows = await query<{
    changes: string;
    added: string;
    removed: string;
    latest: string | null;
    today: string;
  }>(
    `SELECT count(*) FILTER (WHERE changed_at >= now() - interval '5 minutes')::text AS changes,
            COALESCE(sum(delta) FILTER (WHERE delta > 0 AND changed_at >= now() - interval '5 minutes'), 0)::text AS added,
            COALESCE(sum(delta) FILTER (WHERE delta < 0 AND changed_at >= now() - interval '5 minutes'), 0)::text AS removed,
            max(changed_at)::text AS latest,
            count(*) FILTER (WHERE changed_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')::text AS today
       FROM platform_stock_movements
      WHERE platform = $1::text AND shop_id = $2::text`,
    [platform, shopId],
  );
  const row = rows[0];
  return {
    changes: Number(row?.changes ?? 0),
    added: Number(row?.added ?? 0),
    removed: Number(row?.removed ?? 0),
    latest: row?.latest ?? null,
    today: Number(row?.today ?? 0),
  };
}

/** รายการสต็อกที่ขยับในช่วง N นาทีล่าสุด — ใช้ในป๊อปอัป "ประวัติเปลี่ยนแปลง" */
export async function listRecentStockChanges({
  platform = TIKTOK_PLATFORM,
  shopId,
  minutes = 5,
  limit = 100,
}: {
  platform?: string;
  shopId: string;
  minutes?: number;
  limit?: number;
}): Promise<
  Array<{
    skuId: string;
    sellerSku: string | null;
    productName: string | null;
    fromQty: number | null;
    toQty: number;
    delta: number;
    changedAt: string;
  }>
> {
  const rows = await query<{
    sku_id: string;
    seller_sku: string | null;
    product_name: string | null;
    from_qty: number | null;
    to_qty: number;
    delta: number;
    changed_at: string;
  }>(
    `SELECT sku_id, seller_sku, product_name, from_qty, to_qty, delta, changed_at::text AS changed_at
       FROM platform_stock_movements
      WHERE platform = $1::text AND shop_id = $2::text
        AND changed_at >= now() - ($3::int || ' minutes')::interval
      ORDER BY changed_at DESC, id DESC
      LIMIT $4::int`,
    [platform, shopId, Math.max(1, minutes), Math.min(500, Math.max(1, limit))],
  );
  return rows.map((row) => ({
    skuId: row.sku_id,
    sellerSku: row.seller_sku,
    productName: row.product_name,
    fromQty: row.from_qty,
    toQty: row.to_qty,
    delta: row.delta,
    changedAt: row.changed_at,
  }));
}

export async function getStockMovements(
  shopId: string,
  options: { limit?: number; cursor?: StockMovementCursor; platform?: string } = {},
): Promise<StockMovementRow[]> {
  const platform = options.platform ?? TIKTOK_PLATFORM;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
  const params: unknown[] = [platform, shopId];
  let cursorClause = "";
  const cursor = options.cursor;
  if (cursor?.changedAt && cursor.id) {
    params.push(cursor.changedAt, cursor.id);
    cursorClause = cursor.back
      ? ` AND (changed_at, id) > ($3::timestamptz, $4::bigint)`
      : ` AND (changed_at, id) < ($3::timestamptz, $4::bigint)`;
  }
  const direction = cursor?.back ? "ASC" : "DESC";

  const rows = await query<{
    id: string;
    seller_sku: string | null;
    product_name: string | null;
    from_qty: number | null;
    to_qty: number;
    delta: number;
    changed_at: string;
  }>(
    `SELECT id::text AS id, seller_sku, product_name, from_qty, to_qty, delta, changed_at::text AS changed_at
       FROM platform_stock_movements
      WHERE platform = $1 AND shop_id = $2${cursorClause}
      ORDER BY changed_at ${direction}, id ${direction}
      LIMIT ${limit}`,
    params as never[],
  );

  const movements = rows.map((row) => ({
    id: row.id,
    sellerSku: row.seller_sku,
    productName: row.product_name,
    fromQty: row.from_qty,
    toQty: row.to_qty,
    delta: row.delta,
    changedAt: row.changed_at,
  }));

  // ถอยหลังมา ให้กลับลำดับให้เป็นใหม่→เก่าเหมือนเดิม
  return cursor?.back ? movements.reverse() : movements;
}

export async function getLastStockSync(shopId: string, platform = TIKTOK_PLATFORM): Promise<string | null> {
  // ใช้เวลาทั้งสองอย่าง: รอบที่ดึงมาล่าสุด และเวลาที่ค่าจริงเปลี่ยนล่าสุด
  // (ถ้าดึงแล้วไม่มีอะไรเปลี่ยน max(updated_at) จะค้างเก่า — ผู้ใช้จะคิดว่าข้อมูลเก่า)
  const rows = await query<{ at: string | null }>(
    `SELECT greatest(
              coalesce((SELECT max(finished_at) FROM platform_sync_runs WHERE platform = $1 AND kind = 'stock'), 'epoch'::timestamptz),
              coalesce((SELECT max(updated_at) FROM platform_stock WHERE platform = $1 AND shop_id = $2), 'epoch'::timestamptz)
            )::text AS at`,
    [platform, shopId],
  );
  return rows[0]?.at ?? null;
}

export type SkuOrderRow = {
  orderId: string;
  quantity: number;
  orderedAt: string;
  status: string;
};

export type SkuDetail = {
  skuId: string;
  productId: string | null;
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
  /** ชิ้นที่ลูกค้าส่งคืนแล้วแต่ยังไม่ถึงร้าน */
  inTransit: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
  updatedAt: string;
  imageUrl: string | null;
  /** ราคาขาย (จาก TikTok) และสกุลเงิน — null เมื่อยังไม่เคยดึงรายละเอียด */
  price: number | null;
  currency: string | null;
  /** สถานะสินค้าบน TikTok เช่น ACTIVATE / DRAFT */
  productStatus: string | null;
  /** เส้นทางหมวดหมู่ เช่น "ของเล่นและงานอดิเรก › ของเล่นก่อสร้าง" */
  category: string | null;
  /** ธงพรีออเดอร์ที่ตั้งเองในระบบ (TikTok ไม่ส่งฟิลด์นี้มา) */
  isPreorder: boolean;
  orders: SkuOrderRow[];
  movements: StockMovement[];
};

/** รายละเอียดของ SKU เดียว: คงเหลือต่อคลัง + ออเดอร์ที่ตัดสต็อก + ประวัติที่บันทึกไว้ */
export async function getSkuDetail(
  shopId: string,
  skuId: string,
  platform = TIKTOK_PLATFORM,
): Promise<SkuDetail | null> {
  const rows = await query<{
    sku_id: string;
    seller_sku: string | null;
    product_name: string | null;
    quantity: number;
    warehouses: Array<{ warehouseId: string; quantity: number }>;
    updated_at: string;
    image_url: string | null;
    product_id: string | null;
    price: string | null;
    currency: string | null;
    product_status: string | null;
    category: string | null;
    is_preorder: boolean;
  }>(
    `SELECT s.sku_id, s.seller_sku, s.product_name, s.quantity, s.warehouses, s.updated_at::text AS updated_at,
            s.image_url, s.product_id, s.price::text AS price, s.currency, s.product_status, s.category, s.is_preorder
       FROM platform_stock s
      WHERE s.platform = $1 AND s.shop_id = $2 AND s.sku_id = $3
      LIMIT 1`,
    [platform, shopId, skuId],
  );
  const row = rows[0];
  if (!row) return null;

  // ค่าสด (TikTok): เปิดดูสินค้าตัวไหน = ขอจาก TikTok 1 คำขอ แล้วเขียนลง DB ก่อนแสดง
  if (platform === TIKTOK_PLATFORM && row.product_id) {
    const config = await getPlatformConfig();
    const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
    if (config.tiktok && account?.accessToken && account.shopCipher) {
      try {
        const detail = await callTikTokApi<{
          skus?: ApiSku[];
          main_images?: Array<{ thumb_urls?: string[]; uri?: string }>;
          title?: string;
        }>({
          config: config.tiktok,
          accessToken: account.accessToken,
          path: `/product/202309/products/${row.product_id}`,
          query: { shop_cipher: account.shopCipher },
        });

        const image = detail.main_images?.[0]?.thumb_urls?.[0] ?? detail.main_images?.[0]?.uri ?? row.image_url;

        for (const sku of detail.skus ?? []) {
          if (!sku.id) continue;
          const warehouses = (sku.inventory ?? []).map((item) => ({
            warehouseId: String(item.warehouse_id ?? ""),
            quantity: Number(item.quantity ?? 0),
          }));
          const fresh = warehouses.reduce((sum, item) => sum + item.quantity, 0);

          const before = await query<{ quantity: number }>(
            `SELECT quantity FROM platform_stock WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
            [TIKTOK_PLATFORM, shopId, sku.id],
          );

          await query(
            `UPDATE platform_stock
                SET quantity = $4, warehouses = $5::jsonb,
                    -- ค่าที่ฝ่ายขายเพิ่งแก้และยังล็อกอยู่ ห้ามซิงก์เขียนทับ
                    image_url = CASE WHEN image_locked_until > now() THEN image_url ELSE COALESCE($6, image_url) END,
                    product_name = CASE WHEN name_locked_until > now() THEN product_name ELSE COALESCE($7, product_name) END,
                    updated_at = now()
              WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
            [TIKTOK_PLATFORM, shopId, sku.id, fresh, JSON.stringify(warehouses), image ?? null, detail.title ?? null],
          );

          if (before[0] && before[0].quantity !== fresh) {
            await query(
              `INSERT INTO platform_stock_movements (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [TIKTOK_PLATFORM, shopId, sku.id, sku.seller_sku ?? null, detail.title ?? null, before[0].quantity, fresh, fresh - before[0].quantity],
            );
          }
        }

        row.quantity = Number(
          (
            await query<{ quantity: number }>(
              `SELECT quantity FROM platform_stock WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
              [TIKTOK_PLATFORM, shopId, skuId],
            )
          )[0]?.quantity ?? row.quantity,
        );
        row.updated_at = (
          await query<{ at: string }>(
            `SELECT updated_at::text AS at FROM platform_stock WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
            [TIKTOK_PLATFORM, shopId, skuId],
          )
        )[0]?.at ?? row.updated_at;
        // รูปจาก TikTok คือความจริงล่าสุด — ทับค่าเดิมเสมอ (เดิมใช้ ?? เลยไม่ยอมเปลี่ยนตามหลังเปลี่ยนรูป)
        row.image_url = image ?? row.image_url;
      } catch {
        // ดึงสดไม่ได้ก็แสดงค่าที่มีใน DB
      }
    }
  }

  const orders = await query<{ order_id: string; quantity: number; ordered_at: string; status: string }>(
    `SELECT i.order_id, i.quantity, o.create_time::text AS ordered_at, o.order_status AS status
       FROM platform_order_items i
       JOIN platform_orders o ON o.platform = i.platform AND o.shop_id = i.shop_id AND o.order_id = i.order_id
      WHERE i.platform = $1 AND i.shop_id = $2 AND i.sku_id = $3
      ORDER BY o.create_time DESC
      LIMIT 10`,
    [platform, shopId, skuId],
  );

  const movements = await query<{
    seller_sku: string | null;
    product_name: string | null;
    from_qty: number | null;
    to_qty: number;
    delta: number;
    changed_at: string;
  }>(
    `SELECT seller_sku, product_name, from_qty, to_qty, delta, changed_at::text AS changed_at
       FROM platform_stock_movements
      WHERE platform = $1 AND shop_id = $2 AND sku_id = $3
      ORDER BY changed_at DESC
      LIMIT 10`,
    [platform, shopId, skuId],
  );

  // รูป: ใช้รูปที่เก็บไว้กับสต็อกก่อน (มีครบทุก SKU) แล้วค่อย fallback ไปรูปในออเดอร์
  let imageUrl = row.image_url;
  if (!imageUrl) {
    const image = await query<{ image_url: string }>(
      `SELECT image_url FROM platform_order_items
        WHERE platform = $1 AND shop_id = $2 AND sku_id = $3 AND coalesce(image_url, '') <> ''
        ORDER BY updated_at DESC LIMIT 1`,
      [platform, shopId, skuId],
    );
    imageUrl = image[0]?.image_url ?? null;
  }

  const inTransit = await getInTransitQty(shopId, skuId, platform);

  return {
    skuId: row.sku_id,
    inTransit,
    sellerSku: row.seller_sku,
    productName: row.product_name,
    quantity: Number(row.quantity ?? 0),
    warehouses: row.warehouses ?? [],
    updatedAt: row.updated_at,
    productId: row.product_id ?? null,
    imageUrl,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    productStatus: row.product_status,
    category: row.category,
    isPreorder: Boolean(row.is_preorder),
    orders: orders.map((order) => ({
      orderId: order.order_id,
      quantity: Number(order.quantity ?? 0),
      orderedAt: order.ordered_at,
      status: order.status,
    })),
    movements: movements.map((movement) => ({
      sellerSku: movement.seller_sku,
      productName: movement.product_name,
      fromQty: movement.from_qty,
      toQty: movement.to_qty,
      delta: movement.delta,
      changedAt: movement.changed_at,
    })),
  };
}

/**
 * อัปเดตสต็อก "เฉพาะสินค้าที่เพิ่งมีเหตุการณ์" (ออเดอร์/คืนสินค้า) — ไม่ต้องดึงทั้งแคตตาล็อก
 * เรียกจาก webhook: มีออเดอร์ใหม่ → รู้ทันทีว่าสินค้าไหนถูกแตะ → ขอเฉพาะสินค้านั้น
 */
export async function refreshStockForRecentOrders(shopId: string, withinMinutes = 60): Promise<number> {
  const products = await query<{ product_id: string }>(
    `SELECT DISTINCT s.product_id
       FROM platform_order_items i
       JOIN platform_stock s ON s.platform = i.platform AND s.shop_id = i.shop_id AND s.sku_id = i.sku_id
      WHERE i.platform = $1
        AND i.shop_id = $2
        AND i.updated_at >= now() - ($3 || ' minutes')::interval
        AND coalesce(s.product_id, '') <> ''`,
    [TIKTOK_PLATFORM, shopId, String(withinMinutes)],
  );
  const ids = products.map((row) => row.product_id);
  if (ids.length === 0) return 0;

  const config = await getPlatformConfig();
  const account = await getPlatformAccountRow(TIKTOK_PLATFORM, shopId);
  if (!config.tiktok || !account?.accessToken || !account.shopCipher) return 0;

  let updated = 0;
  for (let index = 0; index < ids.length; index += 3) {
    const batch = ids.slice(index, index + 3);
    await Promise.all(
      batch.map(async (productId) => {
        try {
          const detail = await callTikTokApi<{ skus?: ApiSku[] }>({
            config: config.tiktok!,
            accessToken: account.accessToken!,
            path: `/product/202309/products/${productId}`,
            query: { shop_cipher: account.shopCipher! },
          });

          for (const sku of detail.skus ?? []) {
            if (!sku.id) continue;
            const warehouses = (sku.inventory ?? []).map((item) => ({
              warehouseId: String(item.warehouse_id ?? ""),
              quantity: Number(item.quantity ?? 0),
            }));
            const quantity = warehouses.reduce((sum, item) => sum + item.quantity, 0);

            const before = await query<{ quantity: number }>(
              `SELECT quantity FROM platform_stock WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
              [TIKTOK_PLATFORM, shopId, sku.id],
            );

            await query(
              `UPDATE platform_stock
                  SET quantity = $4, warehouses = $5::jsonb, updated_at = now()
                WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
              [TIKTOK_PLATFORM, shopId, sku.id, quantity, JSON.stringify(warehouses)],
            );

            if (before[0] && before[0].quantity !== quantity) {
              await query(
                `INSERT INTO platform_stock_movements (platform, shop_id, sku_id, seller_sku, product_name, from_qty, to_qty, delta)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [TIKTOK_PLATFORM, shopId, sku.id, sku.seller_sku ?? null, null, before[0].quantity, quantity, quantity - before[0].quantity],
              );
              updated += 1;
            }
          }
        } catch {
          // สินค้าตัวใดพังก็ข้ามไป ไม่ให้ทั้งรอบล้ม
        }
      }),
    );
  }

  return updated;
}
