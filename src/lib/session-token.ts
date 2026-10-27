import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "pcms_rev_session";
export const MAX_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours (Hard Gate: <= 24h)
export const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours default

export interface SessionPayload {
  sub: string;
  role: "admin" | "staff";
  iat: number;
  exp: number;
  jti: string;
}

let fallbackRuntimeSecret: string | null = null;

export function getSessionSecret(): string {
  const fromEnv =
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    return fromEnv;
  }
  if (!fallbackRuntimeSecret) {
    fallbackRuntimeSecret = crypto.randomBytes(48).toString("hex");
  }
  return fallbackRuntimeSecret;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function base64UrlDecode(input: string): Buffer | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
    return Buffer.from(input, "base64url");
  } catch {
    return null;
  }
}

function signSegment(segment: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(segment, "utf8").digest();
}

export function createSessionToken(
  input: {
    username: string;
    role?: "admin" | "staff";
    ttlSeconds?: number;
    nowSeconds?: number;
  },
  secretOverride?: string,
): string {
  const secret = secretOverride ?? getSessionSecret();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    MAX_SESSION_TTL_SECONDS,
    Math.max(60, input.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS),
  );
  const payload: SessionPayload = {
    sub: input.username,
    role: input.role ?? "admin",
    iat: now,
    exp: now + ttl,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(signSegment(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  options?: { nowSeconds?: number; secretOverride?: string },
): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  const providedSig = base64UrlDecode(encodedSig);
  if (!providedSig || providedSig.length !== 32) return null;

  const secret = options?.secretOverride ?? getSessionSecret();
  const expectedSig = signSegment(encodedPayload, secret);

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  const payloadBuf = base64UrlDecode(encodedPayload);
  if (!payloadBuf) return null;

  try {
    const parsed = JSON.parse(payloadBuf.toString("utf8")) as Partial<SessionPayload>;
    if (
      typeof parsed.sub !== "string" ||
      !parsed.sub.trim() ||
      (parsed.role !== "admin" && parsed.role !== "staff") ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.jti !== "string"
    ) {
      return null;
    }

    const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    // Reject expired tokens or tokens with lifetime > 24 hours
    if (parsed.exp <= now) return null;
    if (parsed.exp - parsed.iat > MAX_SESSION_TTL_SECONDS) return null;
    if (parsed.iat > now + 60) return null;

    return {
      sub: parsed.sub,
      role: parsed.role,
      iat: parsed.iat,
      exp: parsed.exp,
      jti: parsed.jti,
    };
  } catch {
    return null;
  }
}

export function extractCookieValue(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (key === cookieName) {
      return decodeURIComponent(pair.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp.slice(0, 64);

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  return "127.0.0.1";
}

export function verifyCsrfOrigin(request: Request): { ok: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true };
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const rawSource = originHeader || refererHeader;

  if (!rawSource) {
    return { ok: false, reason: "Missing Origin/Referer header" };
  }

  let sourceHost: string;
  try {
    sourceHost = new URL(rawSource).host.toLowerCase();
  } catch {
    return { ok: false, reason: "Invalid Origin/Referer URL" };
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const hostHeader = request.headers.get("host")?.trim().toLowerCase();

  const allowedHosts = new Set<string>();
  if (forwardedHost) allowedHosts.add(forwardedHost);
  if (hostHeader) allowedHosts.add(hostHeader);
  try {
    const reqUrlHost = new URL(request.url).host.toLowerCase();
    if (reqUrlHost) allowedHosts.add(reqUrlHost);
  } catch {
    // ignore
  }

  if (allowedHosts.size === 0 || !allowedHosts.has(sourceHost)) {
    return { ok: false, reason: "Cross-origin request blocked (CSRF protection)" };
  }

  return { ok: true };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function checkApiRateLimit(
  key: string,
  limit = 120,
  windowMs = 60_000,
  nowMs = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (v.resetAt <= nowMs) rateBuckets.delete(k);
    }
  }

  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds,
  };
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
