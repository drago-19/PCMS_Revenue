import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "./store";
import {
  finishSyncRun,
  startSyncRun,
  syncOrders,
  syncStatements,
  type SyncContext,
} from "./sync";

export interface SyncStats {
  orders: number;
  statements: number;
  orderFinance: number;
}

export interface SyncWindow {
  from: number;
  to: number;
  kind: string;
  /** "update" (ค่าเริ่มต้น) = ดึงออเดอร์ที่สร้างหรือถูกแก้ในช่วงนั้น · "create" = ใช้ตอนดึงย้อน */
  mode?: "create" | "update";
  /** รอบถี่ ๆ เอาแค่ออเดอร์ — ข้ามการดึง statement (ซึ่งกินเวลาหลายวินาที) */
  skipStatements?: boolean;
  /** จำกัดเฉพาะร้านนี้ (ไม่ส่ง = ทุกร้านที่เชื่อมต่อ) */
  shopId?: string;
}

// statement ของ TikTok ออกช้ากว่าวันจริงได้หลายวัน จึงดึงย้อนกว้างกว่ารอบปกติ
const LIVE_STATEMENT_LOOKBACK_DAYS = 7;

/** ยังไม่ได้ตั้งค่าแอปหรือยังไม่มีร้านที่เชื่อม — เรียกซิงก์ไม่ได้ */
export class SyncUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncUnavailableError";
  }
}

/**
 * ร้านที่ต้องซิงก์ — ค่าเริ่มต้นคือทุกร้านที่เชื่อมต่อ (ไม่ใช่ร้านแรกเท่านั้น)
 * ส่ง shopId มาเมื่อต้องการซิงก์ร้านเดียว (เช่น กดดึงสดจากหน้าร้านนั้น)
 */
async function buildContexts(onlyShopId?: string): Promise<Array<{ ctx: SyncContext; shopName: string }>> {
  const config = await getPlatformConfig();
  if (!config.tiktok) {
    throw new SyncUnavailableError("ยังไม่ได้ตั้งค่าแอป TikTok");
  }

  const accounts = (await listPlatformAccounts(TIKTOK_PLATFORM)).filter(
    (row) => row.status === "connected" && (!onlyShopId || row.accountKey === onlyShopId),
  );
  if (accounts.length === 0) {
    throw new SyncUnavailableError("ยังไม่มีร้านที่เชื่อมต่อ");
  }

  const contexts: Array<{ ctx: SyncContext; shopName: string }> = [];
  for (const account of accounts) {
    const row = await getPlatformAccountRow(TIKTOK_PLATFORM, account.accountKey);
    if (!row?.accessToken || !row.shopCipher) continue;
    contexts.push({
      ctx: {
        config: config.tiktok,
        accessToken: row.accessToken,
        shopCipher: row.shopCipher,
        shopId: account.accountKey,
      },
      shopName: account.shopName ?? account.accountKey,
    });
  }
  if (contexts.length === 0) {
    throw new SyncUnavailableError("ไม่พบ token ของร้าน");
  }

  return contexts;
}

/** ดึงออเดอร์ + เงินจาก TikTok ช่วงหนึ่ง แล้วบันทึกผลลง platform_sync_runs */
export async function runTikTokSync(
  window: SyncWindow,
): Promise<{ stats: SyncStats; shopName: string }> {
  const contexts = await buildContexts(window.shopId);
  const stats: SyncStats = { orders: 0, statements: 0, orderFinance: 0 };
  const failures: Array<{ shopName: string; message: string }> = [];

  // วนทุกร้าน — ร้านหนึ่งล้มต้องไม่ทำให้ร้านอื่นหยุด
  for (const { ctx, shopName } of contexts) {
    const runId = await startSyncRun(
      TIKTOK_PLATFORM,
      window.kind,
      new Date(window.from * 1000),
      new Date(window.to * 1000),
    );

    try {
      const byUpdate = window.mode !== "create";
      const orders = await syncOrders(
        ctx,
        window.from,
        window.to,
        byUpdate ? "update" : "create",
      );
      const statementFrom = byUpdate
        ? window.from - LIVE_STATEMENT_LOOKBACK_DAYS * 86400
        : window.from;
      const money = window.skipStatements
        ? { statements: 0, orderFinance: 0 }
        : await syncStatements(ctx, statementFrom, window.to);
      await finishSyncRun(runId, orders + money.statements + money.orderFinance, null);
      stats.orders += orders;
      stats.statements += money.statements;
      stats.orderFinance += money.orderFinance;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSyncRun(runId, 0, message);
      failures.push({ shopName, message });
    }
  }

  if (failures.length === contexts.length) {
    throw new Error(failures[0].message);
  }
  for (const failure of failures) {
    console.error(`[sync] ร้าน ${failure.shopName} ล้มเหลว: ${failure.message}`);
  }

  return {
    stats,
    shopName: contexts.length === 1 ? contexts[0].shopName : `${contexts.length} ร้าน`,
  };
}

