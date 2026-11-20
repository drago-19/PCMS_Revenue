// เขียนยอดคงเหลือของสต็อกกลางลงประกาศของทุกร้านที่ผูกไว้ (แบบเดียวกับ Shipnity: ใช้จำนวนสต็อกร่วมกัน)
//
// กติกาความปลอดภัย:
// - เขียนเฉพาะรหัสที่มีแถวใน central_stock แล้วเท่านั้น — รหัสที่ยังไม่เคยเติมของจะไม่ถูกแตะประกาศเลย
// - ยอดที่เขียนคือ on_hand ของสต็อกกลาง (ไม่ใช่ยอดเดิมของร้านนั้น) และไม่ต่ำกว่า 0
// - TikTok: ส่งเป็นส่วนต่างหลังอ่านค่าสด ตามที่ adjustStock บังคับ — ถ้าขายไประหว่างนั้นจะได้ conflict แล้วลองใหม่
// - Shopee: ตั้งจำนวนตรง ๆ ผ่าน setShopeeStock
// - ร้านจริงยังผ่านด่าน PLATFORM_STOCK_WRITE_LIVE ใน adjustStock ตามเดิม
//
// ทิศทาง 20 พ.ย. 2026 (แก้จากรอบก่อนที่เข้าใจกลับทาง): สต็อกกลางของเราเป็นเจ้าของยอดตัวจริง
// เติมของที่คลังกลางแล้วระบบดันยอดขึ้นประกาศทุกร้านที่ผูก · ออเดอร์บน TikTok หักยอดกลางแล้วดันกลับขึ้นประกาศ
// Search/TikTok ไม่ได้เป็นเจ้าของยอดอีกต่อไป — Shipnity เป็นเพียงตัวอย่างหน้าตาที่ผู้ใช้เลิกใช้แล้ว
//
// กันความเสี่ยงร้านจริง: ร้านที่ไม่ใช่ร้านทดสอบ (SANDBOX_) จะยังไม่ถูกเขียนจนกว่าจะตั้ง STOCK_PUSH_LIVE=1
// เพราะร้านจริงมีคนซื้ออยู่ตลอด การเขียนยอดผิดครั้งเดียวคือขายเกินของจริง

import { query } from "@/lib/db";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { ensureValidShopeeToken } from "@/lib/platform/shopee-sync";
import { setShopeeStock } from "@/lib/platform/shopee";
import { adjustStock, StockWriteError } from "@/lib/platform/stock-write";

export type PushResult = {
  pushed: number;
  skipped: number;
  failed: number;
  /** ร้านจริงที่ยังไม่เปิด STOCK_PUSH_LIVE — ตั้งใจไม่เขียน ไม่ใช่ความผิดพลาด */
  blocked: number;
  /** จำนวนร้านที่มีประกาศถูกเขียนจริงในรอบนี้ */
  shops: number;
  /** true = ไม่ได้เขียนเลยเพราะปิดด้วย STOCK_PUSH_ENABLED=0 */
  disabled: boolean;
  errors: Array<{ platform: string; shopId: string; skuId: string; error: string }>;
};

/** ผลของการดันยอดแบบสั่งทันที — บวกเวลาและรหัสที่สั่งเข้ามา ให้หน้าจอบอกผู้ใช้ได้ว่าใช้เวลาเท่าไร */
export type PushNowResult = PushResult & { codes: string[]; ms: number };

type PushTarget = {
  platform: string;
  shopId: string;
  skuId: string;
  productId: string | null;
  skuCode: string;
  target: number;
  current: number;
};

const MAX_CONFLICT_RETRIES = 2;
/** เขียนยอดพร้อมกันได้กี่ประกาศ — ลดเวลารวมเมื่อผูกหลายร้านโดยไม่ชนเพดานคำขอของแพลตฟอร์ม */
const PUSH_CONCURRENCY = 4;

/**
 * ธงเปิด/ปิดการดันยอดจากสต็อกกลางขึ้นประกาศ — ค่าเริ่มต้นคือ "เปิด"
 * เพราะสต็อกกลางเป็นเจ้าของยอด: เติมที่เดียวแล้วทุกร้านที่ผูกต้องขายได้ตาม
 * ปิดได้ด้วย STOCK_PUSH_ENABLED=0 เมื่อต้องหยุดเขียนทั้งระบบชั่วคราว (เช่น แพลตฟอร์มล่ม)
 */
export function stockPushEnabled(): boolean {
  const flag = (process.env.STOCK_PUSH_ENABLED ?? "").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

/**
 * เปิดให้เขียนยอดลง "ร้านจริง" หรือยัง — ค่าเริ่มต้นคือยัง (ร้านทดสอบ SANDBOX_ เขียนได้เสมอ)
 * ทำไมร้านจริงต้องรอธง: ยอดบนประกาศของร้านที่ขายอยู่คือยอดที่ลูกค้าเห็น ถ้าระบบเขียนผิดครั้งเดียว
 * จะขายเกินของจริงและต้องไปแก้กับลูกค้า จึงเปิดเมื่อทดสอบบนร้านทดสอบจนนิ่งแล้วเท่านั้น
 */
export function stockPushLive(): boolean {
  return process.env.STOCK_PUSH_LIVE === "1";
}

// เขียนยอดทีละรอบ: ถ้าออเดอร์ทะลักพร้อมกัน (flash sale) ตัวเรียกจะต่อคิวกัน
// รอบถัดไปจะเห็นยอดตรงแล้วและข้าม — จึงไม่ยิงคำขอซ้ำจนชนเพดานของแพลตฟอร์ม
let pushQueue: Promise<unknown> = Promise.resolve();

/**
 * เทียบยอดกลางกับยอดบนประกาศของแต่ละร้าน แล้วเขียนเฉพาะที่ยังไม่ตรง
 * เรียกซ้ำได้บ่อยเท่าที่ต้องการ — ยอดตรงแล้วจะเป็น no-op
 */
export function pushPoolToListings(options: { skuCodes?: string[] } = {}): Promise<PushResult> {
  // ปิดด้วย STOCK_PUSH_ENABLED=0 → ไม่แตะประกาศเลยและไม่ยิงคำขอใด ๆ ออกไป
  // ทุกทางที่เรียกฟังก์ชันนี้ (scheduler · webhook · ปุ่มรับเข้าสต็อกกลาง) จึงหยุดพร้อมกันจากที่เดียว
  if (!stockPushEnabled()) {
    return Promise.resolve({ pushed: 0, skipped: 0, failed: 0, blocked: 0, shops: 0, disabled: true, errors: [] });
  }
  const next = pushQueue.then(
    () => runPush(options),
    () => runPush(options),
  );
  pushQueue = next.catch(() => undefined);
  return next;
}

async function runPush(options: { skuCodes?: string[] } = {}): Promise<PushResult> {
  const result: PushResult = { pushed: 0, skipped: 0, failed: 0, blocked: 0, shops: 0, disabled: false, errors: [] };
  const codes = options.skuCodes?.length ? options.skuCodes : null;
  // นับร้านที่เขียนสำเร็จจริง (ไม่นับประกาศซ้ำของร้านเดียวกัน) — หน้าจอใช้บอกผู้ใช้ว่ากี่ร้าน
  const pushedShops = new Set<string>();

  const targets = await query<{
    platform: string;
    shop_id: string;
    sku_id: string;
    product_id: string | null;
    sku_code: string;
    target: number;
    current: number | null;
    shop_name: string | null;
  }>(
    `SELECT l.platform,
            l.shop_id,
            l.sku_id,
            s.product_id,
            l.sku_code,
            c.on_hand::int AS target,
            s.quantity AS current,
            a.shop_name
       FROM central_stock_links l
       JOIN central_stock c ON c.sku_code = l.sku_code AND c.archived_at IS NULL
       JOIN platform_stock s
         ON s.platform = l.platform AND s.shop_id = l.shop_id AND s.sku_id = l.sku_id
       LEFT JOIN platform_accounts a
         ON a.platform = l.platform AND a.account_key = l.shop_id
      -- ต้องเคยมีของเข้าคลังกลางจริง (รับเข้าหรือตั้งต้นตอนผูก/คืนยอด) เท่านั้น
      -- รหัสที่มียอดเพราะถูกหักจากการขายอย่างเดียวจะไม่ถูกเขียนลงประกาศ — กันกรณีประกาศถูกล้างเป็น 0 ยกชุด
      WHERE ($1::text[] IS NULL OR l.sku_code = ANY($1::text[]))
        AND EXISTS (
          SELECT 1 FROM central_stock_movements m
           WHERE m.sku_code = c.sku_code AND m.kind IN ('receive', 'open')
        )
      ORDER BY l.platform, l.shop_id, l.sku_id`,
    [codes],
  );

  if (targets.length === 0) return result;

  const shopeeTokens = new Map<string, Awaited<ReturnType<typeof ensureValidShopeeToken>>>();

  // เขียนหลายร้านพร้อมกันแทนการเขียนทีละร้าน — 2 ร้านใช้เวลาเท่าร้านเดียว
  // (ชั้น API ของ TikTok/Shopee มีตัวจำกัดจำนวนคำขอพร้อมกันอยู่แล้ว)
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const row = targets[cursor];
      cursor += 1;
      const target = Math.max(0, Number(row.target));
      const current = Number(row.current ?? 0);
      if (target === current) {
        result.skipped += 1;
        continue;
      }

      // ร้านจริงต้องรอธง STOCK_PUSH_LIVE — ร้านทดสอบ (SANDBOX_) เขียนได้ทันที
      // นับเป็น blocked ไม่ใช่ failed: ระบบเลือกไม่เขียนเอง ไม่ใช่แพลตฟอร์มปฏิเสธ
      if (!isSandboxShopName(row.shop_name) && !stockPushLive()) {
        result.blocked += 1;
        continue;
      }

      const item: PushTarget = {
        platform: row.platform,
        shopId: row.shop_id,
        skuId: row.sku_id,
        productId: row.product_id,
        skuCode: row.sku_code,
        target,
        current,
      };

      try {
        if (item.platform === "TikTok") {
          await pushTikTok(item);
        } else if (item.platform === "Shopee") {
          await pushShopee(item, shopeeTokens);
        } else {
          result.skipped += 1;
          continue;
        }
        result.pushed += 1;
        pushedShops.add(item.shopId);
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          platform: item.platform,
          shopId: item.shopId,
          skuId: item.skuId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, targets.length) }, worker));

  result.shops = pushedShops.size;
  return result;
}

/**
 * ดันยอดของรหัสที่ระบุขึ้นประกาศทันที (ใช้ทางเขียนเดิมทั้งหมด — คิวเดียวกัน ไม่มีเส้นทางใหม่)
 * เรียกหลังเติม/ปรับยอดกลาง เพื่อให้ "เติมที่เดียวแล้วขายได้ทุกร้าน" เกิดจริงในเสี้ยววินาที
 * ไม่โยน error ออกไป: การรับเข้าสต็อกกลางต้องบันทึกสำเร็จแม้ TikTok ล่ม — คืนเป็น failed/errors ให้หน้าจอบอก
 */
export async function pushCodesNow(codes: string[]): Promise<PushNowResult> {
  const list = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  const started = Date.now();
  if (list.length === 0) {
    return { pushed: 0, skipped: 0, failed: 0, blocked: 0, shops: 0, disabled: false, errors: [], codes: [], ms: 0 };
  }
  try {
    const result = await pushPoolToListings({ skuCodes: list });
    return { ...result, codes: list, ms: Date.now() - started };
  } catch (error) {
    return {
      pushed: 0,
      skipped: 0,
      failed: 1,
      blocked: 0,
      shops: 0,
      disabled: false,
      errors: [
        {
          platform: "",
          shopId: "",
          skuId: "",
          error: error instanceof Error ? error.message : String(error),
        },
      ],
      codes: list,
      ms: Date.now() - started,
    };
  }
}

async function pushTikTok(item: PushTarget): Promise<void> {
  if (!item.productId) throw new Error("ไม่รู้รหัสสินค้าบน TikTok ของ SKU นี้");
  let expected = item.current;
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const delta = item.target - expected;
    if (delta === 0) return;
    try {
      await adjustStock({
        shopId: item.shopId,
        productId: item.productId,
        skuId: item.skuId,
        delta,
        expectedQuantity: expected,
      });
      return;
    } catch (error) {
      // มีคนซื้อระหว่างนั้น — อ่านยอดใหม่จากข้อผิดพลาดแล้วลองใหม่ ไม่เขียนทับด้วยค่าเก่า
      if (error instanceof StockWriteError && error.code === "conflict") {
        const current = Number((error.detail as { current?: number } | undefined)?.current);
        if (Number.isFinite(current)) {
          expected = current;
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error("ยอดบน TikTok ขยับตลอดเวลา — ลองใหม่รอบหน้า");
}

async function pushShopee(
  item: PushTarget,
  tokens: Map<string, Awaited<ReturnType<typeof ensureValidShopeeToken>>>,
): Promise<void> {
  const [itemIdRaw, modelIdRaw] = item.skuId.split(":");
  const itemId = Number.parseInt(itemIdRaw ?? "", 10);
  const modelId = Number.parseInt(modelIdRaw ?? "0", 10);
  if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("รหัสสินค้า Shopee ไม่ถูกต้อง");

  let ctx = tokens.get(item.shopId);
  if (!ctx) {
    ctx = await ensureValidShopeeToken(item.shopId);
    tokens.set(item.shopId, ctx);
  }

  const response = await setShopeeStock(ctx.config, {
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
    itemId,
    quantity: item.target,
    modelId,
  });
  if (response.failureList.length > 0) {
    throw new Error("Shopee ปฏิเสธการแก้สต็อก (สินค้าอาจอยู่ในโปรโมชันหรือจำนวนต่ำกว่าที่ถูกจอง)");
  }
}
