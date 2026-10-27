import {
  BCRYPT_COST,
  ensureAdminUser,
  hashPassword,
  recordAuditLog,
  requireApiAuth,
  verifyPassword,
} from "@/lib/auth";
import { withTransaction } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 4096) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as { currentPassword?: unknown; newPassword?: unknown };
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return Response.json(
      { error: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่ให้ครบถ้วน", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return Response.json(
      { error: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร (ไม่เกิน 128 ตัวอักษร)", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const admin = await ensureAdminUser();
  const matches = await verifyPassword(currentPassword, admin.passwordHash);
  if (!matches) {
    await recordAuditLog({
      actor: auth.session.sub,
      action: "auth.password_change",
      ipAddress: auth.ip,
      outcome: "failure",
      details: { reason: "invalid_current_password" },
      requestId: auth.requestId,
    });
    return Response.json(
      { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", requestId: auth.requestId },
      { status: 401, headers: { "x-request-id": auth.requestId } },
    );
  }

  const newHash = await hashPassword(newPassword, BCRYPT_COST);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE app_users
       SET password_hash = $2, updated_at = now()
       WHERE username = $1`,
      [admin.username, newHash],
    );
    await recordAuditLog(
      {
        actor: auth.session.sub,
        action: "auth.password_change",
        ipAddress: auth.ip,
        outcome: "success",
        requestId: auth.requestId,
      },
      client,
    );
  });

  return Response.json(
    { ok: true, message: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", requestId: auth.requestId },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}
