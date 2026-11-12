// ประกอบข้อมูลสำหรับแดชบอร์ดหน้า /platform (เฉพาะ TikTok ก่อน)
//
// ใช้เฉพาะสิทธิ์ที่มีอยู่จริง: Finance Information (statement) + Fulfillment Basic (พัสดุ)
// ไม่เขียนลงตารางของระบบบิลเดิม และไม่แตะ transactions / invoice_registry

import {
  listStatements,
  searchPackages,
  type TikTokAppConfig,
  type TikTokStatement,
} from "@/lib/platform/tiktok";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";

export interface DayPoint {
  date: string;
  settlement: number;
  revenue: number;
  fee: number;
}

export interface StatusCount {
  status: string;
  label: string;
  count: number;
}

export interface TikTokDashboard {
  shop: { name: string | null; region: string | null; connectedAt: string | null };
  rangeDays: number;
  totals: {
    settlement: number;
    revenue: number;
    fee: number;
    statements: number;
    packages: number;
  };
  daily: DayPoint[];
  packageStatuses: StatusCount[];
  recent: Array<Pick<TikTokStatement, "id" | "statementTime" | "settlementAmount" | "revenueAmount" | "paymentStatus">>;
  error: string | null;
}

const PACKAGE_LABELS: Record<string, string> = {
  PROCESSING: "รอขนส่งเข้ารับ",
  FULFILLING: "อยู่ระหว่างขนส่ง",
  COMPLETED: "ส่งถึงแล้ว",
  CANCELLED: "ยกเลิก/สูญหาย",
};

function toDateKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * อ่านข้อมูลจริงจาก TikTok ตามช่วงวันที่ (ค่าเริ่มต้น 30 วัน)
 * คืนค่า error แบบนุ่มนวลเพื่อให้หน้าเว็บยังแสดงได้ แม้ token หมดอายุหรือสิทธิ์ยังไม่พอ
 */
export async function getTikTokDashboard(rangeDays = 30): Promise<TikTokDashboard | null> {
  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const target = accounts.find((account) => account.status === "connected" && account.shopCipher)
    ?? accounts.find((account) => account.shopCipher);
  if (!target) return null;

  const config = await getPlatformConfig();
  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, target.accountKey);
  if (!config.tiktok || !row?.accessToken || !row.shopCipher) return null;

  // เก็บเป็นค่าคงที่ เพื่อให้ TypeScript รู้ว่าไม่เป็น null ภายใน closure
  const accessToken = row.accessToken;
  const shopCipher = row.shopCipher;

  const appConfig: TikTokAppConfig = config.tiktok;
  const nowUnix = Math.floor(Date.now() / 1000);
  const fromUnix = nowUnix - rangeDays * 24 * 60 * 60;

  const empty: TikTokDashboard = {
    shop: { name: target.shopName, region: target.region, connectedAt: target.connectedAt },
    rangeDays,
    totals: { settlement: 0, revenue: 0, fee: 0, statements: 0, packages: 0 },
    daily: [],
    packageStatuses: [],
    recent: [],
    error: null,
  };

  try {
    const statements = await listStatements({
      config: appConfig,
      accessToken,
      shopCipher,
      fromUnix,
      toUnix: nowUnix + 60,
      // TikTok รับ page_size ของ statement ได้ไม่เกิน 50
      pageSize: 50,
    });

    const dailyMap = new Map<string, DayPoint>();
    let settlement = 0;
    let revenue = 0;
    let fee = 0;

    for (const statement of statements.statements) {
      const settlementValue = Number(statement.settlementAmount || 0);
      const revenueValue = Number(statement.revenueAmount || 0);
      const feeValue = Number(statement.feeAmount || 0);
      settlement += settlementValue;
      revenue += revenueValue;
      fee += feeValue;

      const key = toDateKey(statement.statementTime);
      const point = dailyMap.get(key) ?? { date: key, settlement: 0, revenue: 0, fee: 0 };
      point.settlement += settlementValue;
      point.revenue += revenueValue;
      point.fee += feeValue;
      dailyMap.set(key, point);
    }

    // นับจำนวนพัสดุแยกตามสถานะจาก total_count ของแต่ละสถานะ (4 คำขอ)
    // — เร็วกว่าไล่ทุกหน้า (พัสดุหลักพันต่อเดือน) และได้ตัวเลขครบจริง
    const statuses = ["PROCESSING", "FULFILLING", "COMPLETED", "CANCELLED"] as const;
    const statusCounts = await Promise.all(
      statuses.map((status) =>
        searchPackages({
          config: appConfig,
          accessToken,
          shopCipher,
          createTimeGe: fromUnix,
          createTimeLt: nowUnix + 60,
          pageSize: 1,
          packageStatus: status,
        }).then((result) => ({ status, count: result.totalCount })),
      ),
    );

    const packagesTotal = statusCounts.reduce((sum, entry) => sum + entry.count, 0);
    const packageStatuses: StatusCount[] = statusCounts
      .map((entry) => ({
        status: entry.status,
        label: PACKAGE_LABELS[entry.status] ?? entry.status,
        count: entry.count,
      }))
      .filter((entry) => entry.count > 0);

    return {
      ...empty,
      totals: {
        settlement: round2(settlement),
        revenue: round2(revenue),
        fee: round2(fee),
        statements: statements.statements.length,
        packages: packagesTotal,
      },
      daily: [...dailyMap.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((point) => ({
          ...point,
          settlement: round2(point.settlement),
          revenue: round2(point.revenue),
          fee: round2(point.fee),
        })),
      packageStatuses,
      recent: statements.statements.slice(0, 5).map((statement) => ({
        id: statement.id,
        statementTime: statement.statementTime,
        settlementAmount: statement.settlementAmount,
        revenueAmount: statement.revenueAmount,
        paymentStatus: statement.paymentStatus,
      })),
      error: null,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "ดึงข้อมูลจาก TikTok ไม่สำเร็จ",
    };
  }
}
