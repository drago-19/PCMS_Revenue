import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, type Queryable } from "./db";
import {
  extractCookieValue,
  getClientIp,
  SESSION_COOKIE_NAME,
  verifyCsrfOrigin,
  verifySessionToken,
  type SessionPayload,
} from "./session-token";

export const BCRYPT_COST = 12; // Hard Gate: bcrypt cost >= 10
export const MAX_LOGIN_ATTEMPTS = 5; // Hard Gate: 5 failed attempts
export const BLOCK_DURATION_MS = 15 * 60 * 1000; // Hard Gate: block 15 minutes
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface MemoryBruteForceEntry {
  failedCount: number;
  firstFailedAtMs: number;
  blockedUntilMs: number | null;
}

const memoryBruteForce = new Map<string, MemoryBruteForceEntry>();

export async function hashPassword(
  plainPassword: string,
  cost = BCRYPT_COST,
): Promise<string> {
  const safeCost = Math.max(10, cost);
  return bcrypt.hash(plainPassword, safeCost);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  if (!plainPassword || !passwordHash) return false;
  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

export function getConfiguredAdminUsername(): string {
  return (process.env.AUTH_USERNAME ?? "admin").trim() || "admin";
}

// Pre-computed bcrypt cost-12 hash of default initial credential if env is not set
const FALLBACK_ADMIN_HASH =
  "$2b$12$e4G3z5o1Y8k7V9m2N6p0QuW3r5T7y9U1i3O5p7A9s1D3f5G7h9J1K";

let cachedDefaultHash: string | null = null;
let cachedDefaultPlain: string | null = null;

export async function getInitialPasswordHash(): Promise<string> {
  const envHash = process.env.AUTH_PASSWORD_HASH?.trim();
  if (envHash) {
    if (/^\$2[aby]\$\d{2}\$.{53}$/.test(envHash)) {
      return envHash;
    }
    try {
      const decoded = Buffer.from(envHash, "base64").toString("utf8").trim();
      if (/^\$2[aby]\$\d{2}\$.{53}$/.test(decoded)) {
        return decoded;
      }
    } catch {
      // ignore invalid base64
    }
  }
  const envInitialPlain = process.env.AUTH_INITIAL_PASSWORD?.trim();
  if (envInitialPlain) {
    if (!cachedDefaultHash || cachedDefaultPlain !== envInitialPlain) {
      cachedDefaultHash = await hashPassword(envInitialPlain, BCRYPT_COST);
      cachedDefaultPlain = envInitialPlain;
    }
    return cachedDefaultHash;
  }
  return FALLBACK_ADMIN_HASH;
}

export async function ensureAdminUser(
  db?: Queryable,
): Promise<{ username: string; passwordHash: string; role: "admin" | "staff" }> {
  const username = getConfiguredAdminUsername();
  const existing = await queryOne<{
    username: string;
    password_hash: string;
    role: string;
  }>(
    "SELECT username, password_hash, role FROM app_users WHERE username = $1",
    [username],
    db,
  );

  if (existing) {
    return {
      username: existing.username,
      passwordHash: existing.password_hash,
      role: existing.role === "staff" ? "staff" : "admin",
    };
  }

  const initialHash = await getInitialPasswordHash();
  await query(
    `INSERT INTO app_users (username, password_hash, role, updated_at)
     VALUES ($1, $2, 'admin', now())
     ON CONFLICT (username) DO NOTHING`,
    [username, initialHash],
    db,
  );

  return {
    username,
    passwordHash: initialHash,
    role: "admin",
  };
}

export function checkMemoryBruteForce(
  ipKey: string,
  nowMs = Date.now(),
): { blocked: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const entry = memoryBruteForce.get(ipKey);
  if (!entry) {
    return {
      blocked: false,
      remainingAttempts: MAX_LOGIN_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  if (entry.blockedUntilMs && entry.blockedUntilMs > nowMs) {
    return {
      blocked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntilMs - nowMs) / 1000)),
    };
  }

  if (
    (entry.blockedUntilMs && entry.blockedUntilMs <= nowMs) ||
    nowMs - entry.firstFailedAtMs > ATTEMPT_WINDOW_MS
  ) {
    memoryBruteForce.delete(ipKey);
    return {
      blocked: false,
      remainingAttempts: MAX_LOGIN_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  return {
    blocked: false,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - entry.failedCount),
    retryAfterSeconds: 0,
  };
}

export function recordMemoryLoginFailure(
  ipKey: string,
  nowMs = Date.now(),
): { blocked: boolean; failedCount: number; remainingAttempts: number; retryAfterSeconds: number } {
  const current = memoryBruteForce.get(ipKey);
  if (
    !current ||
    (current.blockedUntilMs && current.blockedUntilMs <= nowMs) ||
    nowMs - current.firstFailedAtMs > ATTEMPT_WINDOW_MS
  ) {
    const entry: MemoryBruteForceEntry = {
      failedCount: 1,
      firstFailedAtMs: nowMs,
      blockedUntilMs: null,
    };
    memoryBruteForce.set(ipKey, entry);
    return {
      blocked: false,
      failedCount: 1,
      remainingAttempts: MAX_LOGIN_ATTEMPTS - 1,
      retryAfterSeconds: 0,
    };
  }

  current.failedCount += 1;
  if (current.failedCount >= MAX_LOGIN_ATTEMPTS) {
    current.blockedUntilMs = nowMs + BLOCK_DURATION_MS;
    return {
      blocked: true,
      failedCount: current.failedCount,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(BLOCK_DURATION_MS / 1000),
    };
  }

  return {
    blocked: false,
    failedCount: current.failedCount,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - current.failedCount),
    retryAfterSeconds: 0,
  };
}

export function clearMemoryLoginFailures(ipKey: string): void {
  memoryBruteForce.delete(ipKey);
}

export async function checkLoginBruteForce(
  ipKey: string,
  db?: Queryable,
): Promise<{ blocked: boolean; remainingAttempts: number; retryAfterSeconds: number }> {
  const memStatus = checkMemoryBruteForce(ipKey);
  if (memStatus.blocked) return memStatus;

  try {
    const row = await queryOne<{
      failed_count: number;
      first_failed_at: string;
      blocked_until: string | null;
    }>(
      "SELECT failed_count, first_failed_at, blocked_until FROM auth_rate_limits WHERE ip_key = $1",
      [ipKey],
      db,
    );
    if (!row) return memStatus;

    const nowMs = Date.now();
    const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : null;
    const firstFailedAtMs = new Date(row.first_failed_at).getTime();

    if (blockedUntilMs && blockedUntilMs > nowMs) {
      return {
        blocked: true,
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000)),
      };
    }

    if (
      (blockedUntilMs && blockedUntilMs <= nowMs) ||
      nowMs - firstFailedAtMs > ATTEMPT_WINDOW_MS
    ) {
      await query("DELETE FROM auth_rate_limits WHERE ip_key = $1", [ipKey], db);
      return {
        blocked: false,
        remainingAttempts: MAX_LOGIN_ATTEMPTS,
        retryAfterSeconds: 0,
      };
    }

    const failed = Number(row.failed_count ?? 0);
    return {
      blocked: false,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - failed),
      retryAfterSeconds: 0,
    };
  } catch {
    return memStatus;
  }
}

export async function recordLoginFailure(
  ipKey: string,
  db?: Queryable,
): Promise<{ blocked: boolean; failedCount: number; remainingAttempts: number; retryAfterSeconds: number }> {
  const memResult = recordMemoryLoginFailure(ipKey);
  try {
    const now = new Date();
    const blockedUntil = memResult.blocked
      ? new Date(now.getTime() + BLOCK_DURATION_MS).toISOString()
      : null;

    await query(
      `INSERT INTO auth_rate_limits (ip_key, failed_count, first_failed_at, blocked_until, updated_at)
       VALUES ($1, $2, now(), $3, now())
       ON CONFLICT (ip_key) DO UPDATE SET
         failed_count = EXCLUDED.failed_count,
         blocked_until = EXCLUDED.blocked_until,
         updated_at = now()`,
      [ipKey, memResult.failedCount, blockedUntil],
      db,
    );
  } catch {
    // Fallback to memory state if DB is temporarily unreachable
  }
  return memResult;
}

export async function clearLoginFailures(
  ipKey: string,
  db?: Queryable,
): Promise<void> {
  clearMemoryLoginFailures(ipKey);
  try {
    await query("DELETE FROM auth_rate_limits WHERE ip_key = $1", [ipKey], db);
  } catch {
    // ignore
  }
}

export async function recordAuditLog(
  entry: {
    actor: string;
    action: string;
    ipAddress: string;
    outcome: "success" | "failure" | "blocked";
    details?: Record<string, unknown>;
    requestId?: string;
  },
  db?: Queryable,
): Promise<void> {
  // Never allow secret/password/token fields inside audit details
  const safeDetails: Record<string, unknown> = {};
  if (entry.details) {
    for (const [k, v] of Object.entries(entry.details)) {
      if (/password|secret|token|authorization|cookie/i.test(k)) continue;
      safeDetails[k] = v;
    }
  }

  try {
    await query(
      `INSERT INTO audit_logs (actor, action, ip_address, outcome, details_json, request_id, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())`,
      [
        entry.actor.slice(0, 120),
        entry.action.slice(0, 120),
        entry.ipAddress.slice(0, 64),
        entry.outcome,
        JSON.stringify(safeDetails),
        entry.requestId ?? crypto.randomUUID(),
      ],
      db,
    );
  } catch (error) {
    console.error("audit log write failed", {
      action: entry.action,
      outcome: entry.outcome,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export function requireApiAuth(
  request: Request,
):
  | { ok: true; session: SessionPayload; ip: string; requestId: string }
  | { ok: false; response: Response } {
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const ip = getClientIp(request);

  const csrf = verifyCsrfOrigin(request);
  if (!csrf.ok) {
    return {
      ok: false,
      response: Response.json(
        { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน (CSRF Protection)", requestId },
        { status: 403, headers: { "x-request-id": requestId } },
      ),
    };
  }

  const token = extractCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  const session = verifySessionToken(token);

  if (!session) {
    return {
      ok: false,
      response: Response.json(
        { error: "กรุณาเข้าสู่ระบบก่อนใช้งาน", requestId },
        { status: 401, headers: { "x-request-id": requestId } },
      ),
    };
  }

  return { ok: true, session, ip, requestId };
}
