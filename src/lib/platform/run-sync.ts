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

async function buildContext(): Promise<{ ctx: SyncContext; shopName: string }> {
  const config = await getPlatformConfig();
  if (!config.tiktok) {
    throw new SyncUnavailableError("ยังไม่ได้ตั้งค่าแอป TikTok");
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const target = accounts.find((row) => row.status === "connected" && row.shopCipher);
  if (!target) {
    throw new SyncUnavailableError("ยังไม่มีร้านที่เชื่อมต่อ");
  }

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, target.accountKey);
  if (!row?.accessToken || !row.shopCipher) {
    throw new SyncUnavailableError("ไม่พบ token ของร้าน");
  }

  return {
    ctx: {
      config: config.tiktok,
      accessToken: row.accessToken,
      shopCipher: row.shopCipher,
      shopId: target.accountKey,
    },
    shopName: target.shopName ?? target.accountKey,
  };
}

/** ดึงออเดอร์ + เงินจาก TikTok ช่วงหนึ่ง แล้วบันทึกผลลง platform_sync_runs */
export async function runTikTokSync(
  window: SyncWindow,
): Promise<{ stats: SyncStats; shopName: string }> {
  const { ctx, shopName } = await buildContext();
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
    const money = await syncStatements(ctx, statementFrom, window.to);
    await finishSyncRun(runId, orders + money.statements + money.orderFinance, null);
    return {
      stats: { orders, statements: money.statements, orderFinance: money.orderFinance },
      shopName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(runId, 0, message);
    throw error;
  }
}

