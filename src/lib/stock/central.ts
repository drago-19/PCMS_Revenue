// สต็อกกลาง — หนึ่งยอดต่อรหัสสินค้า ใช้ร่วมทุกแพลตฟอร์มและทุกร้าน
//
// กติกาของไฟล์นี้:
// - ยอดจริงอยู่ที่ central_stock.on_hand และถูกแก้พร้อมแถวการเคลื่อนไหวในทรานแซกชันเดียวกันเสมอ
// - การขายหนึ่งบรรทัดออเดอร์มีแถวเดียว (unique index) — ซิงก์ซ้ำจึงไม่หักซ้ำ
// - ออเดอร์ที่ถูกยกเลิก = เขียนทับแถวเดิมเป็น 0 (คืนยอด) ไม่ใช่ลบแถว เพื่อให้ตรวจย้อนได้

import { query, withTransaction } from "@/lib/db";

export type CentralStockSummary = {
  skuCode: string;
  productName: string | null;
  onHand: number;
  updatedAt: string;
};

export type CentralStockMovement = {
  kind: string;
  quantity: number;
  source: string;
  note: string | null;
  createdAt: string;
};

export type CentralStockLinkRow = {
  platform: string;
  shopId: string;
  shopName: string | null;
  skuId: string;
  sellerSku: string | null;
  productName: string | null;
  quantity: number | null;
  linkedAt: string | null;
};

type DeductionTarget = {
  /** ชื่อ source ที่เก็บในแถว mouvement: tiktok | shopee | facebook */
  source: string;
  /** ชื่อแพลตฟอร์มที่เก็บในคอลัมน์ platform */
  platform: string;
  /** CTE ที่คืนคอลัมน์ sku_code, shop_id, order_id, line_id, qty */
  targetSql: string;
  params: unknown[];
};

const HOURS_MIN = 1;
const HOURS_MAX = 72;

function clampHours(hours: number | undefined): number {
  const value = Math.trunc(Number(hours ?? 48));
  if (!Number.isFinite(value)) return 48;
  return Math.min(HOURS_MAX, Math.max(HOURS_MIN, value));
}

export function normalizeSkuCode(raw: string): string {
  return raw.trim().slice(0, 120);
}

/**
 * เติม/ตัดยอดสต็อกกลางด้วยมือ (บวก = รับเข้า, ลบ = ปรับออก)
 * เขียน movement + ปรับ on_hand ในทรานแซกชันเดียว — ยอดกับประวัติจึงไม่หลุดจากกัน
 */
export async function addCentralStock(input: {
  skuCode: string;
  productName?: string | null;
  quantity: number;
  note?: string | null;
  actor?: string | null;
}): Promise<{ skuCode: string; onHand: number; restored: boolean }> {
  const skuCode = normalizeSkuCode(input.skuCode);
  const quantity = Math.trunc(Number(input.quantity));
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");
  if (!Number.isFinite(quantity) || quantity === 0) throw new Error("จำนวนต้องเป็นตัวเลขและไม่เป็นศูนย์");

  return withTransaction(async (db) => {
    // รหัสที่เคยถูกเลิกใช้: รับเข้าของแล้วต้องกลับมาโชว์ในรายการเอง ไม่งั้นผู้ใช้จะหาที่เพิ่มไม่เจอ
    const before = await query<{ archived_at: string | null }>(
      `SELECT archived_at FROM central_stock WHERE sku_code = $1`,
      [skuCode],
      db,
    );
    const wasArchived = Boolean(before[0]?.archived_at);

    const rows = await query<{ on_hand: number }>(
      `INSERT INTO central_stock (sku_code, product_name, on_hand, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (sku_code) DO UPDATE
         SET on_hand = central_stock.on_hand + EXCLUDED.on_hand,
             product_name = COALESCE(EXCLUDED.product_name, central_stock.product_name),
             archived_at = NULL,
             updated_at = now()
       RETURNING on_hand`,
      [skuCode, input.productName?.trim() || null, quantity],
      db,
    );
    await query(
      `INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
       VALUES ($1, $2, $3, 'manual', $4, $5)`,
      [skuCode, quantity > 0 ? "receive" : "adjust", quantity, input.note?.trim() || null, input.actor ?? null],
      db,
    );
    if (wasArchived) {
      await query(
        `INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
         VALUES ($1, 'restore', 0, 'manual', 'เปิดใช้รหัสกลับมาเมื่อรับเข้า', $2)`,
        [skuCode, input.actor ?? null],
        db,
      );
    }
    return { skuCode, onHand: Number(rows[0]?.on_hand ?? 0), restored: wasArchived };
  });
}

/** ผูกสินค้า (ร้าน × SKU) เข้ากับรหัสสต็อกกลาง — ผูกใหม่ทับของเดิมได้ */
export async function linkListing(input: {
  platform: string;
  shopId: string;
  skuId: string;
  skuCode: string;
  actor?: string | null;
}): Promise<void> {
  const skuCode = normalizeSkuCode(input.skuCode);
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");
  const shopId = input.shopId.trim();
  const skuId = input.skuId.trim();
  if (!shopId || !skuId) throw new Error("ต้องระบุร้านและ SKU");

  await withTransaction(async (db) => {
    await query(
      `INSERT INTO central_stock_links (platform, shop_id, sku_id, sku_code, linked_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform, shop_id, sku_id) DO UPDATE
         SET sku_code = EXCLUDED.sku_code, linked_by = EXCLUDED.linked_by, linked_at = now()`,
      [input.platform, shopId, skuId, skuCode, input.actor ?? null],
      db,
    );

    // ผูกแล้วต้องมีรหัสกลางให้เห็นทันที — ตั้งต้นด้วยยอดที่ประกาศมีอยู่จริง
    // (ถ้าตั้ง 0 ระบบจะไปเขียนทับประกาศให้เป็นศูนย์ในรอบถัดไป)
    await query(
      `WITH created AS (
         INSERT INTO central_stock (sku_code, product_name, on_hand, updated_at)
         SELECT $1, s.product_name, GREATEST(COALESCE(s.quantity, 0), 0), now()
           FROM platform_stock s
          WHERE s.platform = $2 AND s.shop_id = $3 AND s.sku_id = $4
         ON CONFLICT (sku_code) DO NOTHING
         RETURNING on_hand
       )
       INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
       SELECT $1, 'open', on_hand, 'link', 'ตั้งต้นจากยอดบนประกาศตอนผูก', $5
         FROM created
        WHERE on_hand <> 0`,
      [skuCode, input.platform, shopId, skuId, input.actor ?? null],
      db,
    );
  });
}

export async function unlinkListing(input: {
  platform: string;
  shopId: string;
  skuId: string;
}): Promise<void> {
  await query(
    `DELETE FROM central_stock_links WHERE platform = $1 AND shop_id = $2 AND sku_id = $3`,
    [input.platform, input.shopId.trim(), input.skuId.trim()],
  );
}

/**
 * หักยอดขายเข้าสต็อกกลางจากทุกช่องทางที่เรามีข้อมูล
 * - TikTok / Shopee: บรรทัดออเดอร์ที่ผูกไว้ (central_stock_links) ของออเดอร์ในหน้าต่างเวลา
 * - Facebook: บรรทัดในออเดอร์ Shipnity ที่ contact_method = facebook และรหัสมีในสต็อกกลาง
 * ออเดอร์ที่ถูกยกเลิกเขียนทับเป็น 0 — เรียกซ้ำได้ทุกนาทีโดยไม่หักซ้ำ
 */
export async function reconcileCentralStock(
  options: { hours?: number } = {},
): Promise<{ tiktok: number; shopee: number; facebook: number }> {
  const hours = clampHours(options.hours);
  const tiktok = await applyDeductions({
    source: "tiktok",
    platform: "TikTok",
    params: [hours],
    targetSql: `
      SELECT l.sku_code,
             i.shop_id,
             i.order_id,
             i.line_item_id AS line_id,
             CASE WHEN o.order_status = 'CANCELLED' THEN 0 ELSE -i.quantity END AS qty
        FROM platform_order_items i
        JOIN platform_orders o
          ON o.platform = i.platform AND o.shop_id = i.shop_id AND o.order_id = i.order_id
        JOIN central_stock_links l
          ON l.platform = i.platform AND l.shop_id = i.shop_id AND l.sku_id = i.sku_id
       WHERE i.platform = 'TikTok'
         AND i.quantity <> 0
         AND COALESCE(o.create_time, i.updated_at) >= now() - make_interval(hours => $1::int)`,
  });
  const shopee = await applyDeductions({
    source: "shopee",
    platform: "Shopee",
    params: [hours],
    targetSql: `
      SELECT l.sku_code,
             i.shop_id,
             i.order_id,
             i.line_item_id AS line_id,
             CASE WHEN o.order_status = 'CANCELLED' THEN 0 ELSE -i.quantity END AS qty
        FROM platform_order_items i
        JOIN platform_orders o
          ON o.platform = i.platform AND o.shop_id = i.shop_id AND o.order_id = i.order_id
        JOIN central_stock_links l
          ON l.platform = i.platform AND l.shop_id = i.shop_id AND l.sku_id = i.sku_id
       WHERE i.platform = 'Shopee'
         AND i.quantity <> 0
         AND COALESCE(o.create_time, i.updated_at) >= now() - make_interval(hours => $1::int)`,
  });
  const facebook = await applyDeductions({
    source: "facebook",
    platform: "Facebook",
    params: [hours],
    targetSql: `
      SELECT c.sku_code,
             o.account_key AS shop_id,
             o.payload->>'id' AS order_id,
             t.idx::text AS line_id,
             CASE
               WHEN COALESCE((o.payload->>'cancelled')::boolean, false) THEN 0
               ELSE -COALESCE((t.p->>'quantity')::int, 0)
             END AS qty
        FROM shipnity_orders o
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.payload->'purchases', '[]'::jsonb))
             WITH ORDINALITY AS t(p, idx)
        JOIN central_stock c ON c.sku_code = t.p->>'code'
       WHERE LOWER(COALESCE(o.payload->>'contact_method', '')) = 'facebook'
         AND COALESCE((t.p->>'quantity')::int, 0) <> 0
         AND COALESCE(o.created_at, now()) >= now() - make_interval(hours => $1::int)`,
  });
  return { tiktok, shopee, facebook };
}

/** เขียนแถวขาย (หรือเขียนทับเป็น 0 เมื่อยกเลิก) แล้วบวกส่วนต่างเข้าคลังกลางในคำสั่งเดียว */
async function applyDeductions(target: DeductionTarget): Promise<number> {
  const platformParam = `$${target.params.length + 1}`;
  const sourceParam = `$${target.params.length + 2}`;
  const rows = await query<{ n: number }>(
    `WITH target AS (${target.targetSql}),
     prev AS (
       SELECT m.shop_id, m.source_order_id, m.source_line_id, m.quantity AS old_qty
         FROM central_stock_movements m
         JOIN target t
           ON t.shop_id = m.shop_id
          AND t.order_id = m.source_order_id
          AND t.line_id = m.source_line_id
        WHERE m.source = ${sourceParam}
     ),
     ins AS (
       INSERT INTO central_stock_movements
         (sku_code, kind, quantity, source, source_order_id, source_line_id, shop_id, platform)
       SELECT sku_code, 'sale', qty, ${sourceParam}, order_id, line_id, shop_id, ${platformParam}
         FROM target
       ON CONFLICT (source, shop_id, source_order_id, source_line_id)
         WHERE source_order_id IS NOT NULL AND source_line_id IS NOT NULL
       DO UPDATE SET quantity = EXCLUDED.quantity, sku_code = EXCLUDED.sku_code
       RETURNING shop_id, source_order_id, source_line_id, sku_code, quantity AS new_qty
     ),
     delta AS (
       SELECT ins.sku_code, SUM(ins.new_qty - COALESCE(prev.old_qty, 0))::int AS d
         FROM ins
         LEFT JOIN prev
           ON prev.shop_id = ins.shop_id
          AND prev.source_order_id = ins.source_order_id
          AND prev.source_line_id = ins.source_line_id
        WHERE ins.new_qty IS DISTINCT FROM COALESCE(prev.old_qty, 0)
        GROUP BY ins.sku_code
     ),
     bump AS (
       -- ต้องเป็นการ UPDATE เท่านั้น — การขายห้ามสร้างแถวในคลังกลางเอง
       -- ถ้าสร้างได้ ยอดจะติดลบจากยอดขายอย่างเดียว แล้วตัวเขียนยอดเอา 0 ไปทับประกาศของร้านจริง
       UPDATE central_stock c
          SET on_hand = c.on_hand + delta.d, updated_at = now()
         FROM delta
        WHERE c.sku_code = delta.sku_code
          AND delta.d <> 0
       RETURNING 1 AS done
     )
     SELECT count(*)::int AS n FROM bump`,
    [...target.params, target.platform, target.source],
  );
  return rows[0]?.n ?? 0;
}

/** ยอดคงเหลือของแต่ละรหัสสินค้า — คืนเป็นแผนที่รหัส → จำนวน */
export async function centralStockMap(skuCodes: string[]): Promise<Map<string, number>> {
  const codes = [...new Set(skuCodes.map(normalizeSkuCode).filter(Boolean))];
  if (codes.length === 0) return new Map();
  const rows = await query<{ sku_code: string; on_hand: number }>(
    `SELECT sku_code, on_hand FROM central_stock WHERE archived_at IS NULL AND sku_code = ANY($1::text[])`,
    [codes],
  );
  return new Map(rows.map((row) => [row.sku_code, Number(row.on_hand)]));
}

/** ของแต่ละ SKU บนร้านนี้ผูกกับรหัสกลางอะไร และรหัสนั้นเหลือเท่าไร (คีย์ = sku_id) */
export async function centralStockForShop(
  platform: string,
  shopId: string,
): Promise<Map<string, { skuCode: string; onHand: number | null }>> {
  const rows = await query<{ sku_id: string; sku_code: string; on_hand: number | null }>(
    `SELECT l.sku_id, l.sku_code, c.on_hand
       FROM central_stock_links l
       LEFT JOIN central_stock c ON c.sku_code = l.sku_code AND c.archived_at IS NULL
      WHERE l.platform = $1 AND l.shop_id = $2`,
    [platform, shopId],
  );
  return new Map(
    rows.map((row) => [row.sku_id, { skuCode: row.sku_code, onHand: row.on_hand === null ? null : Number(row.on_hand) }]),
  );
}

/** รายละเอียดของรหัสกลางหนึ่งตัว: ยอดคงเหลือ ล่าสุดกี่รายการ และมีร้านไหนขายรหัสนี้อยู่ */
export async function getCentralStockDetail(skuCode: string): Promise<{
  summary: CentralStockSummary | null;
  movements: CentralStockMovement[];
  links: CentralStockLinkRow[];
}> {
  const code = normalizeSkuCode(skuCode);
  const summary = await query<{ sku_code: string; product_name: string | null; on_hand: number; updated_at: string }>(
    `SELECT sku_code, product_name, on_hand, updated_at FROM central_stock WHERE sku_code = $1`,
    [code],
  );
  const movements = await query<{
    kind: string;
    quantity: number;
    source: string;
    note: string | null;
    created_at: string;
  }>(
    `SELECT kind, quantity, source, note, created_at
       FROM central_stock_movements
      WHERE sku_code = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 12`,
    [code],
  );
  const links = await query<{
    platform: string;
    shop_id: string;
    shop_name: string | null;
    sku_id: string;
    seller_sku: string | null;
    product_name: string | null;
    quantity: number | null;
    linked_at: string | null;
  }>(
    `SELECT l.platform, l.shop_id, a.shop_name, l.sku_id, s.seller_sku, s.product_name,
            s.quantity, l.linked_at
       FROM central_stock_links l
       LEFT JOIN platform_stock s
         ON s.platform = l.platform AND s.shop_id = l.shop_id AND s.sku_id = l.sku_id
       LEFT JOIN platform_accounts a
         ON a.platform = l.platform AND a.account_key = l.shop_id
      WHERE l.sku_code = $1
      ORDER BY l.platform, a.shop_name NULLS LAST, l.shop_id`,
    [code],
  );
  return {
    summary: summary[0]
      ? {
          skuCode: summary[0].sku_code,
          productName: summary[0].product_name,
          onHand: Number(summary[0].on_hand),
          updatedAt: summary[0].updated_at,
        }
      : null,
    movements: movements.map((row) => ({
      kind: row.kind,
      quantity: Number(row.quantity),
      source: row.source,
      note: row.note,
      createdAt: row.created_at,
    })),
    links: links.map((row) => ({
      platform: row.platform,
      shopId: row.shop_id,
      shopName: row.shop_name,
      skuId: row.sku_id,
      sellerSku: row.seller_sku,
      productName: row.product_name,
      quantity: row.quantity === null ? null : Number(row.quantity),
      linkedAt: row.linked_at,
    })),
  };
}

/** ค้นหารหัสสินค้าของสต็อกกลาง (ใช้เลือกตอนผูก) — รหัสที่ยังไม่มีในคลังก็ค้นเจอ */
export async function searchCentralSkuCodes(term: string, limit = 20): Promise<string[]> {
  const q = term.trim();
  if (!q) return [];
  const rows = await query<{ sku_code: string }>(
    `SELECT p.sku_code
       FROM products p
      WHERE p.sku_code ILIKE $1 OR p.product_name ILIKE $1
      ORDER BY p.sku_code
      LIMIT $2`,
    [`%${q}%`, Math.min(50, Math.max(1, limit))],
  );
  return rows.map((row) => row.sku_code);
}

export type CentralListRow = {
  skuCode: string;
  productName: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  onHand: number;
  listingCount: number;
  shopCount: number;
  updatedAt: string;
};

const CENTRAL_PAGE_SIZE = 20;

/** รายการรหัสสินค้าของสต็อกกลาง + จำนวนร้าน/ประกาศที่ผูกอยู่ */
export async function listCentralStockRows(options: {
  q?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: CentralListRow[]; total: number; page: number; pageCount: number }> {
  const q = (options.q ?? "").trim().slice(0, 120);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? CENTRAL_PAGE_SIZE));
  const page = Math.max(1, options.page ?? 1);

  const totalRows = await query<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM central_stock c
      WHERE c.archived_at IS NULL
        AND ($1 = '' OR c.sku_code ILIKE '%' || $1 || '%' OR COALESCE(c.product_name, '') ILIKE '%' || $1 || '%')`,
    [q],
  );
  const total = Number(totalRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  const rows = await query<{
    sku_code: string;
    product_name: string | null;
    image_url: string | null;
    has_image: boolean;
    on_hand: number;
    listing_count: number;
    shop_count: number;
    updated_at: string;
  }>(
    `SELECT c.sku_code,
            c.product_name,
            (SELECT s.image_url FROM platform_stock s
              WHERE s.seller_sku = c.sku_code AND s.image_url IS NOT NULL AND s.image_url <> ''
              LIMIT 1) AS image_url,
            EXISTS (SELECT 1 FROM central_stock_images i WHERE i.sku_code = c.sku_code) AS has_image,
            c.on_hand,
            (SELECT count(*)::int FROM central_stock_links l WHERE l.sku_code = c.sku_code) AS listing_count,
            (SELECT count(DISTINCT l.shop_id)::int FROM central_stock_links l WHERE l.sku_code = c.sku_code) AS shop_count,
            c.updated_at
       FROM central_stock c
      WHERE c.archived_at IS NULL
        AND ($1 = '' OR c.sku_code ILIKE '%' || $1 || '%' OR COALESCE(c.product_name, '') ILIKE '%' || $1 || '%')
      ORDER BY c.on_hand ASC, c.sku_code
      LIMIT $2 OFFSET $3`,
    [q, pageSize, (current - 1) * pageSize],
  );

  return {
    rows: rows.map((row) => ({
      skuCode: row.sku_code,
      productName: row.product_name,
      imageUrl: row.image_url,
      hasImage: Boolean(row.has_image),
      onHand: Number(row.on_hand),
      listingCount: Number(row.listing_count),
      shopCount: Number(row.shop_count),
      updatedAt: row.updated_at,
    })),
    total,
    page: current,
    pageCount,
  };
}

/** ยอดรวมของทั้งคลังกลาง — ใช้เป็นการ์ดสรุปบนหัวหน้า */
export async function centralStockTotals(): Promise<{ skus: number; units: number; out: number; links: number }> {
  const rows = await query<{ skus: number; units: number; out: number; links: number }>(
    `SELECT count(*)::int AS skus,
            COALESCE(sum(on_hand), 0)::int AS units,
            count(*) FILTER (WHERE on_hand <= 0)::int AS out,
            (SELECT count(*)::int FROM central_stock_links) AS links
       FROM central_stock
      WHERE archived_at IS NULL`,
  );
  return {
    skus: Number(rows[0]?.skus ?? 0),
    units: Number(rows[0]?.units ?? 0),
    out: Number(rows[0]?.out ?? 0),
    links: Number(rows[0]?.links ?? 0),
  };
}

export type LinkedShop = { platform: string; shopId: string; shopName: string | null };

/** ร้านที่เชื่อมต่อทั้งหมด (ทุกแพลตฟอร์ม) — ใช้เป็นตัวเลือกในหน้าสต็อกกลาง */
export async function listLinkedShops(): Promise<LinkedShop[]> {
  const rows = await query<{ platform: string; account_key: string; shop_name: string | null }>(
    `SELECT platform, account_key, shop_name
       FROM platform_accounts
      WHERE status = 'connected'
      ORDER BY platform, shop_name NULLS LAST, account_key`,
  );
  return rows.map((row) => ({
    platform: row.platform,
    shopId: row.account_key,
    shopName: row.shop_name,
  }));
}

export type ShopStockRow = {
  skuId: string;
  sellerSku: string | null;
  productName: string | null;
  quantity: number;
  linkedCode: string | null;
  linkedOnHand: number | null;
  /** รูปจากประกาศร้านนี้เอง — ไม่มีและผูกอยู่จะใช้รูปที่แนบกับรหัสกลางแทน */
  imageUrl: string | null;
  centralHasImage: boolean;
};

/** สินค้าของร้านหนึ่ง พร้อมสถานะการผูกกับสต็อกกลาง — ของที่ยังไม่ผูกขึ้นก่อน */
export async function listShopStocksForLinking(options: {
  platform: string;
  shopId: string;
  q?: string;
  linkFilter?: "all" | "linked" | "unlinked";
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: ShopStockRow[];
  total: number;
  page: number;
  pageCount: number;
  linkedCount: number;
  unlinkedCount: number;
}> {
  const q = (options.q ?? "").trim().slice(0, 120);
  const linkFilter =
    options.linkFilter === "linked" || options.linkFilter === "unlinked" ? options.linkFilter : "all";
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? CENTRAL_PAGE_SIZE));
  const page = Math.max(1, options.page ?? 1);

  // จำนวนผูกแล้ว/ยังไม่ผูกนับทั้งร้าน (ไม่คูณคำค้น) — ใช้เป็นตัวเลขบนแท็บให้นิ่งระหว่างพิมพ์ค้นหา
  const countRows = await query<{ linked: number; unlinked: number }>(
    `SELECT count(*) FILTER (WHERE l.sku_code IS NOT NULL)::int AS linked,
            count(*) FILTER (WHERE l.sku_code IS NULL)::int AS unlinked
       FROM platform_stock s
       LEFT JOIN central_stock_links l
         ON l.platform = s.platform AND l.shop_id = s.shop_id AND l.sku_id = s.sku_id
      WHERE s.platform = $1 AND s.shop_id = $2`,
    [options.platform, options.shopId],
  );
  const linkedCount = Number(countRows[0]?.linked ?? 0);
  const unlinkedCount = Number(countRows[0]?.unlinked ?? 0);

  const totalRows = await query<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM platform_stock s
       LEFT JOIN central_stock_links l
         ON l.platform = s.platform AND l.shop_id = s.shop_id AND l.sku_id = s.sku_id
      WHERE s.platform = $1 AND s.shop_id = $2
        AND ($3 = '' OR COALESCE(s.seller_sku, '') ILIKE '%' || $3 || '%' OR COALESCE(s.product_name, '') ILIKE '%' || $3 || '%')
        AND ($4 = 'all' OR ($4 = 'unlinked' AND l.sku_code IS NULL) OR ($4 = 'linked' AND l.sku_code IS NOT NULL))`,
    [options.platform, options.shopId, q, linkFilter],
  );
  const total = Number(totalRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  const rows = await query<{
    sku_id: string;
    seller_sku: string | null;
    product_name: string | null;
    quantity: number;
    linked_code: string | null;
    linked_on_hand: number | null;
    image_url: string | null;
    central_has_image: boolean;
  }>(
    `SELECT s.sku_id, s.seller_sku, s.product_name, s.quantity,
            l.sku_code AS linked_code, c.on_hand AS linked_on_hand,
            s.image_url,
            EXISTS (SELECT 1 FROM central_stock_images i WHERE i.sku_code = l.sku_code) AS central_has_image
       FROM platform_stock s
       LEFT JOIN central_stock_links l
         ON l.platform = s.platform AND l.shop_id = s.shop_id AND l.sku_id = s.sku_id
       LEFT JOIN central_stock c ON c.sku_code = l.sku_code
      WHERE s.platform = $1 AND s.shop_id = $2
        AND ($3 = '' OR COALESCE(s.seller_sku, '') ILIKE '%' || $3 || '%' OR COALESCE(s.product_name, '') ILIKE '%' || $3 || '%')
        AND ($4 = 'all' OR ($4 = 'unlinked' AND l.sku_code IS NULL) OR ($4 = 'linked' AND l.sku_code IS NOT NULL))
      ORDER BY (l.sku_code IS NULL) DESC, s.quantity DESC, s.seller_sku NULLS LAST
      LIMIT $5 OFFSET $6`,
    [options.platform, options.shopId, q, linkFilter, pageSize, (current - 1) * pageSize],
  );

  return {
    rows: rows.map((row) => ({
      skuId: row.sku_id,
      sellerSku: row.seller_sku,
      productName: row.product_name,
      quantity: Number(row.quantity),
      linkedCode: row.linked_code,
      linkedOnHand: row.linked_on_hand === null ? null : Number(row.linked_on_hand),
      imageUrl: row.image_url,
      centralHasImage: Boolean(row.central_has_image),
    })),
    total,
    page: current,
    pageCount,
    linkedCount,
    unlinkedCount,
  };
}

export type CentralSkuLookup = {
  skuCode: string;
  productName: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  onHand: number | null;
  linkedListings: number;
  listings: Array<{
    platform: string;
    shopId: string;
    shopName: string | null;
    sellerSku: string | null;
    quantity: number;
  }>;
};

/**
 * ค้นรหัสกลางหนึ่งตัวพร้อมรูปและจำนวนบนร้าน — ใช้แสดงก่อนกดรับเข้า
 * หารูปจากประกาศของร้านที่ใช้รหัสนี้ (ถ้ามี) และบอกว่าผูกไว้กี่ประกาศแล้ว
 */
export async function lookupSkuForCentral(code: string): Promise<CentralSkuLookup | null> {
  const skuCode = normalizeSkuCode(code);
  if (!skuCode) return null;

  const listings = await query<{
    platform: string;
    shop_id: string;
    shop_name: string | null;
    seller_sku: string | null;
    product_name: string | null;
    image_url: string | null;
    quantity: number;
  }>(
    `SELECT s.platform, s.shop_id, a.shop_name, s.seller_sku, s.product_name, s.image_url, s.quantity
       FROM platform_stock s
       LEFT JOIN platform_accounts a
         ON a.platform = s.platform AND a.account_key = s.shop_id
      WHERE s.seller_sku = $1
      ORDER BY s.quantity DESC
      LIMIT 20`,
    [skuCode],
  );

  const pool = await query<{ on_hand: number }>(
    `SELECT on_hand FROM central_stock WHERE archived_at IS NULL AND sku_code = $1`,
    [skuCode],
  );
  const links = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM central_stock_links WHERE sku_code = $1`,
    [skuCode],
  );
  const storedImage = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM central_stock_images WHERE sku_code = $1`,
    [skuCode],
  );

  const imageUrl = listings.find((row) => row.image_url)?.image_url ?? null;
  let productName = listings.find((row) => row.product_name)?.product_name ?? null;
  if (!productName) {
    const product = await query<{ product_name: string }>(
      `SELECT product_name FROM products WHERE sku_code = $1`,
      [skuCode],
    );
    productName = product[0]?.product_name ?? null;
  }

  if (listings.length === 0 && pool.length === 0 && !productName) return null;

  return {
    skuCode,
    productName,
    imageUrl,
    hasImage: Number(storedImage[0]?.n ?? 0) > 0,
    onHand: pool[0] ? Number(pool[0].on_hand) : null,
    linkedListings: Number(links[0]?.n ?? 0),
    listings: listings.map((row) => ({
      platform: row.platform,
      shopId: row.shop_id,
      shopName: row.shop_name,
      sellerSku: row.seller_sku,
      quantity: Number(row.quantity),
    })),
  };
}

/** เปลี่ยนชื่อที่แสดงของรหัสกลาง — ไม่กระทบยอดและการผูก */
export async function renameCentralStock(input: {
  skuCode: string;
  productName: string | null;
  actor?: string | null;
}): Promise<void> {
  const skuCode = normalizeSkuCode(input.skuCode);
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");
  await query(
    `UPDATE central_stock
        SET product_name = $2, updated_at = now()
      WHERE sku_code = $1 AND archived_at IS NULL`,
    [skuCode, input.productName?.trim() || null],
  );
}

/**
 * เลิกใช้รหัสกลาง — ซ่อนจากรายการและตัดการผูกของทุกร้าน (หยุดหักและหยุดเขียนยอด)
 * ไม่ลบแถวหรือประวัติ เพื่อให้ย้อนดูได้ว่าเคยมีของเท่าไร (soft delete)
 */
export async function archiveCentralStock(input: {
  skuCode: string;
  actor?: string | null;
}): Promise<{ unlinked: number }> {
  const skuCode = normalizeSkuCode(input.skuCode);
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");

  return withTransaction(async (db) => {
    const exists = await query<{ sku_code: string }>(
      `SELECT sku_code FROM central_stock WHERE sku_code = $1 AND archived_at IS NULL`,
      [skuCode],
      db,
    );
    if (exists.length === 0) throw new Error(`ไม่พบรหัส ${skuCode} ในคลังกลาง`);

    const removed = await query<{ n: number }>(
      `WITH gone AS (DELETE FROM central_stock_links WHERE sku_code = $1 RETURNING 1)
       SELECT count(*)::int AS n FROM gone`,
      [skuCode],
      db,
    );
    await query(
      `UPDATE central_stock SET archived_at = now(), updated_at = now() WHERE sku_code = $1 AND archived_at IS NULL`,
      [skuCode],
      db,
    );
    await query(
      `INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
       VALUES ($1, 'archive', 0, 'manual', 'เลิกใช้รหัสกลาง', $2)`,
      [skuCode, input.actor ?? null],
      db,
    );
    return { unlinked: Number(removed[0]?.n ?? 0) };
  });
}

/** นำรหัสที่เลิกใช้แล้วกลับมาใช้ */
export async function restoreCentralStock(input: { skuCode: string; actor?: string | null }): Promise<void> {
  const skuCode = normalizeSkuCode(input.skuCode);
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");
  const rows = await query<{ sku_code: string }>(
    `UPDATE central_stock SET archived_at = NULL, updated_at = now()
      WHERE sku_code = $1 AND archived_at IS NOT NULL
      RETURNING sku_code`,
    [skuCode],
  );
  if (rows.length === 0) throw new Error(`ไม่พบรหัส ${skuCode} ที่ถูกเลิกใช้`);
  await query(
    `INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
     VALUES ($1, 'restore', 0, 'manual', 'นำรหัสกลับมาใช้', $2)`,
    [skuCode, input.actor ?? null],
  );
}

export type ArchivedCentralRow = {
  skuCode: string;
  productName: string | null;
  onHand: number;
  archivedAt: string;
};

/** รหัสที่เลิกใช้แล้ว — ไว้ตรวจและนำกลับมาใช้ */
export async function listArchivedCentralStock(limit = 50): Promise<ArchivedCentralRow[]> {
  const rows = await query<{
    sku_code: string;
    product_name: string | null;
    on_hand: number;
    archived_at: string;
  }>(
    `SELECT sku_code, product_name, on_hand, archived_at
       FROM central_stock
      WHERE archived_at IS NOT NULL
      ORDER BY archived_at DESC
      LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  );
  return rows.map((row) => ({
    skuCode: row.sku_code,
    productName: row.product_name,
    onHand: Number(row.on_hand),
    archivedAt: row.archived_at,
  }));
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 1_200_000;

/** เก็บรูปของรหัสกลาง (บีบอัดก่อนเก็บ) — ใช้เมื่อสินค้ายังไม่มีประกาศบนแพลตฟอร์มให้ดึงรูป */
export async function setCentralStockImage(input: {
  skuCode: string;
  contentType: string;
  buffer: Buffer;
}): Promise<void> {
  const skuCode = normalizeSkuCode(input.skuCode);
  if (!skuCode) throw new Error("ต้องระบุรหัสสินค้าของสต็อกกลาง");
  if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) throw new Error("รับเฉพาะรูป JPG, PNG หรือ WEBP");
  if (input.buffer.length === 0) throw new Error("ไฟล์รูปว่าง");
  if (input.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`รูปใหญ่เกิน ${Math.round(MAX_IMAGE_BYTES / 1000)} KB`);
  }
  const existing = await query<{ sku_code: string }>(
    `SELECT sku_code FROM central_stock WHERE sku_code = $1`,
    [skuCode],
  );
  if (existing.length === 0) throw new Error(`ไม่พบรหัส ${skuCode} ในคลังกลาง`);
  const { compressFileBlob } = await import("@/lib/file-blob");
  await query(
    `INSERT INTO central_stock_images (sku_code, content_type, data, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (sku_code) DO UPDATE
       SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()`,
    [skuCode, input.contentType, compressFileBlob(input.buffer)],
  );
}

/** อ่านรูปของรหัสกลาง (คืน null ถ้าไม่มี) */
export async function getCentralStockImage(
  code: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const skuCode = normalizeSkuCode(code);
  if (!skuCode) return null;
  const rows = await query<{ content_type: string; data: Buffer }>(
    `SELECT content_type, data FROM central_stock_images WHERE sku_code = $1`,
    [skuCode],
  );
  const row = rows[0];
  if (!row) return null;
  const { decompressFileBlob } = await import("@/lib/file-blob");
  const buffer = decompressFileBlob(row.data);
  if (!buffer) return null;
  return { contentType: row.content_type, data: buffer };
}

/**
 * เปลี่ยนรหัสกลาง (แก้รหัสที่พิมพ์ผิด) — ย้ายทั้งยอด การผูก ประวัติ และรูปไปรหัสใหม่ในทรานแซกชันเดียว
 * ต้องไม่ชนกับรหัสที่มีอยู่แล้ว
 */
export async function renameCentralStockCode(input: {
  from: string;
  to: string;
  actor?: string | null;
}): Promise<{ from: string; to: string }> {
  const from = normalizeSkuCode(input.from);
  const to = normalizeSkuCode(input.to);
  if (!from || !to) throw new Error("ต้องระบุรหัสเดิมและรหัสใหม่");
  if (from === to) return { from, to };

  return withTransaction(async (db) => {
    const exists = await query<{ sku_code: string }>(
      `SELECT sku_code FROM central_stock WHERE sku_code = $1`,
      [to],
      db,
    );
    if (exists.length > 0) throw new Error(`รหัส ${to} มีอยู่แล้ว — ใช้รหัสอื่นหรือรวมเข้าด้วยกันแทน`);

    const updated = await query<{ sku_code: string }>(
      `UPDATE central_stock SET sku_code = $2, updated_at = now() WHERE sku_code = $1 RETURNING sku_code`,
      [from, to],
      db,
    );
    if (updated.length === 0) throw new Error("ไม่พบรหัสเดิมในคลังกลาง");

    await query(`UPDATE central_stock_links SET sku_code = $2 WHERE sku_code = $1`, [from, to], db);
    await query(`UPDATE central_stock_movements SET sku_code = $2 WHERE sku_code = $1`, [from, to], db);
    await query(`UPDATE central_stock_images SET sku_code = $2 WHERE sku_code = $1`, [from, to], db);
    await query(
      `INSERT INTO central_stock_movements (sku_code, kind, quantity, source, note, actor)
       VALUES ($1, 'rename', 0, 'manual', $2, $3)`,
      [to, `เปลี่ยนรหัสจาก ${from}`, input.actor ?? null],
      db,
    );
    return { from, to };
  });
}
