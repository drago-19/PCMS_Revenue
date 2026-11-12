import { requireApiAuth } from "@/lib/auth";
import { listStatements, refreshAccessToken } from "@/lib/platform/tiktok";
import {
  getPlatformAccountRow,
  getPlatformConfig,
  listPlatformAccounts,
  markAccountError,
  TIKTOK_PLATFORM,
  updateAccountTokens,
} from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRY_MARGIN_MS = 120_000;

/**
 * ทดสอบดึง Statement จริง 1 ครั้ง — ใช้ยืนยันว่า token และสิทธิ์ Finance Information ใช้งานได้
 * ไม่บันทึกข้อมูลลงตารางใด ๆ (อ่านแล้วรายงานผลเท่านั้น)
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const config = await getPlatformConfig();
  if (!config.tiktok) {
    return Response.json(
      { error: "ยังไม่ได้กรอก App Key / Secret / Service ID", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  // เลือกได้ว่าจะทดสอบร้านไหน (บริษัทหนึ่งมีหลายบัญชี seller ได้) — ไม่ส่งมาคือร้านแรกที่พร้อมใช้
  let requestedKey = "";
  try {
    const raw = await request.text();
    if (raw) {
      const body = JSON.parse(raw) as { accountKey?: unknown };
      if (typeof body.accountKey === "string") requestedKey = body.accountKey.trim();
    }
  } catch {
    // body ไม่ใช่ JSON — ใช้ค่าเริ่มต้น
  }

  const accounts = await listPlatformAccounts(TIKTOK_PLATFORM);
  const target = requestedKey
    ? accounts.find((account) => account.accountKey === requestedKey)
    : accounts.find((account) => account.status === "connected" && account.shopCipher)
      ?? accounts.find((account) => account.shopCipher);

  if (!target) {
    return Response.json(
      { error: "ยังไม่ได้เชื่อมร้าน TikTok", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const row = await getPlatformAccountRow(TIKTOK_PLATFORM, target.accountKey);
  if (!row?.accessToken || !row.shopCipher) {
    return Response.json(
      { error: "ไม่พบ token ของร้านนี้ — กรุณาเชื่อมใหม่", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    let accessToken = row.accessToken;

    const expiresAt = row.accessTokenExpiresAt ? new Date(row.accessTokenExpiresAt).getTime() : 0;
    if (expiresAt - Date.now() < EXPIRY_MARGIN_MS && row.refreshToken) {
      const refreshed = await refreshAccessToken(config.tiktok, row.refreshToken);
      accessToken = refreshed.accessToken;
      await updateAccountTokens({
        platform: TIKTOK_PLATFORM,
        accountKey: row.accountKey,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
      });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const result = await listStatements({
      config: config.tiktok,
      accessToken,
      shopCipher: row.shopCipher,
      fromUnix: nowUnix - 30 * 24 * 60 * 60,
      pageSize: 5,
    });

    const totalSettlement = result.statements.reduce(
      (sum, statement) => sum + Number(statement.settlementAmount || 0),
      0,
    );

    return Response.json(
      {
        ok: true,
        shopName: row.shopName,
        count: result.statements.length,
        totalSettlement: totalSettlement.toFixed(2),
        latest: result.statements[0] ?? null,
        requestId: auth.requestId,
      },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "ดึงข้อมูลไม่สำเร็จ";
    try {
      await markAccountError(TIKTOK_PLATFORM, target.accountKey, message);
    } catch {
      // การบันทึก error ล้มเหลวไม่ควรกลบข้อผิดพลาดเดิม
    }
    return Response.json(
      { error: message, requestId: auth.requestId },
      { status: 502, headers: { "x-request-id": auth.requestId } },
    );
  }
}
