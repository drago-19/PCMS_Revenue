import crypto from "node:crypto";
import { recordAuditLog } from "@/lib/auth";
import {
  extractCookieValue,
  getClientIp,
  SESSION_COOKIE_NAME,
  verifyCsrfOrigin,
  verifySessionToken,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const token = extractCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  const session = verifySessionToken(token);

  await recordAuditLog({
    actor: session?.sub ?? "anonymous",
    action: "auth.logout",
    ipAddress: ip,
    outcome: "success",
    requestId,
  });

  const clearCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

  return Response.json(
    { ok: true, requestId },
    {
      status: 200,
      headers: {
        "Set-Cookie": clearCookie,
        "Cache-Control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}
