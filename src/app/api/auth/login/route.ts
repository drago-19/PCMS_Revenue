import crypto from "node:crypto";
import {
  checkLoginBruteForce,
  clearLoginFailures,
  ensureAdminUser,
  getInitialPasswordHash,
  getSeehengInitialPasswordHash,
  recordAuditLog,
  recordLoginFailure,
  verifyPassword,
} from "@/lib/auth";
import { getPool } from "@/lib/db";
import {
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getClientIp,
  SESSION_COOKIE_NAME,
  verifyCsrfOrigin,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DUMMY_BCRYPT_HASH =
  "$2b$12$e4G3z5o1Y8k7V9m2N6p0QuW3r5T7y9U1i3O5p7A9s1D3f5G7h9J1K";

function buildSessionCookie(token: string, request: Request): string {
  const isSecure =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.url.startsWith("https://");
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${DEFAULT_SESSION_TTL_SECONDS}`,
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const ip = getClientIp(request);

  const csrf = verifyCsrfOrigin(request);
  if (!csrf.ok) {
    return Response.json(
      { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน (CSRF Protection)", requestId },
      { status: 403, headers: { "x-request-id": requestId } },
    );
  }

  // Enforce payload size limit (max 4 KB)
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) {
    return Response.json(
      { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId },
      { status: 413, headers: { "x-request-id": requestId } },
    );
  }

  // Check Brute-Force status (5 failed attempts -> block 15 minutes)
  const bruteForceStatus = await checkLoginBruteForce(ip);
  if (bruteForceStatus.blocked) {
    const minutes = Math.max(1, Math.ceil(bruteForceStatus.retryAfterSeconds / 60));
    await recordAuditLog({
      actor: "anonymous",
      action: "auth.login",
      ipAddress: ip,
      outcome: "blocked",
      details: { retryAfterSeconds: bruteForceStatus.retryAfterSeconds },
      requestId,
    });
    return Response.json(
      {
        error: `คุณกรอกรหัสผ่านผิดเกิน 5 ครั้ง ระบบระงับการเข้าสู่ระบบชั่วคราว กรุณารออีกประมาณ ${minutes} นาที`,
        retryAfterSeconds: bruteForceStatus.retryAfterSeconds,
        requestId,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(bruteForceStatus.retryAfterSeconds),
          "x-request-id": requestId,
        },
      },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    const rawText = await request.text();
    if (rawText.length > 4096) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId },
        { status: 413, headers: { "x-request-id": requestId } },
      );
    }
    body = JSON.parse(rawText) as { username?: unknown; password?: unknown };
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const username =
    typeof body.username === "string" ? body.username.trim().slice(0, 64) : "";
  const password =
    typeof body.password === "string" ? body.password.slice(0, 128) : "";

  if (!username || !password) {
    return Response.json(
      { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const admin = await ensureAdminUser(undefined, username);
    const usernameMatches =
      username.toLowerCase() === admin.username.toLowerCase();
    const targetHash = usernameMatches ? admin.passwordHash : DUMMY_BCRYPT_HASH;
    let passwordValid = await verifyPassword(password, targetHash);

    // If .env AUTH_INITIAL_PASSWORD / AUTH_PASSWORD_HASH was updated, sync it to DB seamlessly
    if (usernameMatches && !passwordValid) {
      const envHash =
        admin.companyId === "seeheng"
          ? await getSeehengInitialPasswordHash()
          : await getInitialPasswordHash();
      if (envHash !== admin.passwordHash && (await verifyPassword(password, envHash))) {
        passwordValid = true;
        await getPool().query(
          "UPDATE public.app_users SET password_hash = $2, updated_at = now() WHERE username = $1",
          [admin.username, envHash],
        );
      }
    }

    if (!usernameMatches || !passwordValid) {
      const failure = await recordLoginFailure(ip);
      await recordAuditLog({
        actor: username,
        action: "auth.login",
        ipAddress: ip,
        outcome: failure.blocked ? "blocked" : "failure",
        details: {
          failedCount: failure.failedCount,
          remainingAttempts: failure.remainingAttempts,
        },
        requestId,
      });

      if (failure.blocked) {
        return Response.json(
          {
            error:
              "คุณกรอกรหัสผ่านผิดครบ 5 ครั้ง ระบบบล็อกการเข้าสู่ระบบเป็นเวลา 15 นาทีเพื่อความปลอดภัย",
            retryAfterSeconds: failure.retryAfterSeconds,
            requestId,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(failure.retryAfterSeconds),
              "x-request-id": requestId,
            },
          },
        );
      }

      return Response.json(
        {
          error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือโอกาสลองอีก ${failure.remainingAttempts} ครั้ง)`,
          remainingAttempts: failure.remainingAttempts,
          requestId,
        },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }

    await clearLoginFailures(ip);
    const token = createSessionToken({
      username: admin.username,
      role: admin.role,
      companyId: admin.companyId,
      ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    });

    await recordAuditLog({
      actor: admin.username,
      action: "auth.login",
      ipAddress: ip,
      outcome: "success",
      details: { role: admin.role, companyId: admin.companyId },
      requestId,
    });

    return Response.json(
      {
        ok: true,
        user: {
          username: admin.username,
          role: admin.role,
          companyId: admin.companyId,
        },
        requestId,
      },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionCookie(token, request),
          "Cache-Control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    console.error("login error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง", requestId },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
