import {
  BCRYPT_COST,
  ensureAdminUser,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  recordAuditLog,
  requireApiAuth,
  verifyPassword,
} from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { notePasswordChanged } from "@/lib/session-revocation";

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

  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) {
    return Response.json(
      {
        error: `รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร (ไม่เกิน 128 ตัวอักษร)`,
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const admin = await ensureAdminUser(undefined, auth.session.sub);
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
  const changedAtSeconds = Math.floor(Date.now() / 1000);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.app_users
       SET password_hash = $2, password_changed_at = to_timestamp($3), updated_at = now()
       WHERE username = $1`,
      [admin.username, newHash, changedAtSeconds],
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

  // ตัด session ที่ออกก่อนการเปลี่ยนรหัสผ่านทันที (อุปกรณ์อื่นต้องล็อกอินใหม่)
  notePasswordChanged(admin.username, changedAtSeconds);

  return Response.json(
    { ok: true, message: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", requestId: auth.requestId },
    { status: 200, headers: { "x-request-id": auth.requestId } },
  );
}
