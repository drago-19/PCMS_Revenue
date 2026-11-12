import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import manifest from "../src/app/manifest";
import {
  BCRYPT_COST,
  BLOCK_DURATION_MS,
  checkMemoryBruteForce,
  clearMemoryLoginFailures,
  getInitialPasswordHash,
  getSeehengInitialPasswordHash,
  hashPassword,
  isRetiredDefaultCredential,
  MAX_LOGIN_ATTEMPTS,
  recordMemoryLoginFailure,
  requireApiAuth,
  verifyPassword,
} from "../src/lib/auth";
import { escapeLikePattern } from "../src/lib/queries";
import {
  createSessionToken,
  MAX_SESSION_TTL_SECONDS,
  SECURITY_HEADERS,
  SESSION_COOKIE_NAME,
  verifyCsrfOrigin,
  verifySessionToken,
} from "../src/lib/session-token";
import { proxy } from "../src/proxy";

test("hashes passwords with bcrypt cost >= 10 and verifies accurately", async () => {
  assert.ok(BCRYPT_COST >= 10, "bcrypt cost must be at least 10");
  const hash = await hashPassword("MySecurePass#2026", 10);
  assert.match(hash, /^\$2[aby]\$10\$/);
  assert.equal(await verifyPassword("MySecurePass#2026", hash), true);
  assert.equal(await verifyPassword("WrongPassword", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("signs and verifies HMAC-SHA256 session tokens and rejects tampering or >24h TTL", () => {
  const secret = "test-session-secret-with-at-least-32-bytes-length!!";
  const now = 1_700_000_000;

  const token = createSessionToken(
    { username: "admin", role: "admin", ttlSeconds: 3600, nowSeconds: now },
    secret,
  );

  const verified = verifySessionToken(token, {
    nowSeconds: now + 100,
    secretOverride: secret,
  });
  assert.ok(verified);
  assert.equal(verified.sub, "admin");
  assert.equal(verified.role, "admin");
  assert.ok(verified.exp - verified.iat <= MAX_SESSION_TTL_SECONDS);

  // Expired token must be rejected
  const expired = verifySessionToken(token, {
    nowSeconds: now + 3601,
    secretOverride: secret,
  });
  assert.equal(expired, null);

  // Tampered payload or signature must be rejected
  const [payloadPart, sigPart] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({
      sub: "hacker",
      role: "admin",
      iat: now,
      exp: now + 3600,
      jti: "123",
    }),
  ).toString("base64url");
  assert.equal(
    verifySessionToken(`${forgedPayload}.${sigPart}`, {
      nowSeconds: now,
      secretOverride: secret,
    }),
    null,
  );
  assert.equal(
    verifySessionToken(`${payloadPart}.invalidSignatureData`, {
      nowSeconds: now,
      secretOverride: secret,
    }),
    null,
  );
});

test("enforces brute-force lockout: 5 failed attempts blocks IP for 15 minutes", () => {
  const ip = "203.0.113.99";
  const baseTime = 1_700_000_000_000;
  clearMemoryLoginFailures(ip);

  for (let i = 1; i <= MAX_LOGIN_ATTEMPTS - 1; i++) {
    const res = recordMemoryLoginFailure(ip, baseTime + i * 1000);
    assert.equal(res.blocked, false);
    assert.equal(res.failedCount, i);
    assert.equal(res.remainingAttempts, MAX_LOGIN_ATTEMPTS - i);
  }

  // 5th attempt triggers 15-minute block
  const fifth = recordMemoryLoginFailure(ip, baseTime + 5000);
  assert.equal(fifth.blocked, true);
  assert.equal(fifth.remainingAttempts, 0);
  assert.equal(fifth.retryAfterSeconds, 900);

  // Check while blocked (e.g. 5 minutes later)
  const midBlock = checkMemoryBruteForce(ip, baseTime + 5000 + 5 * 60 * 1000);
  assert.equal(midBlock.blocked, true);
  assert.equal(midBlock.retryAfterSeconds, 600);

  // Check after 15 minutes have elapsed -> unblocked
  const afterBlock = checkMemoryBruteForce(
    ip,
    baseTime + 5000 + BLOCK_DURATION_MS + 1,
  );
  assert.equal(afterBlock.blocked, false);
  assert.equal(afterBlock.remainingAttempts, MAX_LOGIN_ATTEMPTS);
});

test("protects state-changing requests against CSRF cross-origin attacks", () => {
  const getReq = new Request("http://localhost:3001/api/imports", {
    method: "GET",
  });
  assert.equal(verifyCsrfOrigin(getReq).ok, true);

  // Missing Origin/Referer on DELETE -> blocked
  const noOriginDelete = new Request("http://localhost:3001/api/imports", {
    method: "DELETE",
    headers: { host: "localhost:3001" },
  });
  assert.equal(verifyCsrfOrigin(noOriginDelete).ok, false);

  // Cross-origin attacker POST -> blocked
  const evilOriginPost = new Request("http://localhost:3001/api/imports", {
    method: "POST",
    headers: {
      host: "revenue.company.co.th",
      origin: "https://evil-attacker.com",
    },
  });
  assert.equal(verifyCsrfOrigin(evilOriginPost).ok, false);

  // Same-origin POST (including via Cloudflare Tunnel X-Forwarded-Host) -> allowed
  const validTunnelPost = new Request("http://localhost:3001/api/imports", {
    method: "POST",
    headers: {
      host: "localhost:3001",
      "x-forwarded-host": "revenue.company.co.th",
      origin: "https://revenue.company.co.th",
    },
  });
  assert.equal(verifyCsrfOrigin(validTunnelPost).ok, true);
});

test("requireApiAuth rejects unauthenticated requests with 401 and accepts valid session", () => {
  const unauthReq = new Request("http://localhost:3001/api/imports/1", {
    method: "GET",
    headers: { host: "localhost:3001" },
  });
  const unauthRes = requireApiAuth(unauthReq);
  assert.equal(unauthRes.ok, false);
  if (!unauthRes.ok) {
    assert.equal(unauthRes.response.status, 401);
  }

  const token = createSessionToken({ username: "admin", role: "admin" });
  const authDeleteReq = new Request("http://localhost:3001/api/imports", {
    method: "DELETE",
    headers: {
      host: "localhost:3001",
      origin: "http://localhost:3001",
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
  });
  const authRes = requireApiAuth(authDeleteReq);
  assert.equal(authRes.ok, true);
  if (authRes.ok) {
    assert.equal(authRes.session.sub, "admin");
  }
});

test("escapes SQL LIKE/ILIKE wildcards to prevent wildcard injection", () => {
  assert.equal(escapeLikePattern("100%_test\\row"), "100\\%\\_test\\\\row");
  assert.equal(escapeLikePattern("x".repeat(200)).length, 120);
});

test("Next.js proxy blocks unauthenticated pages/APIs and attaches security headers", () => {
  // 1. Unauthenticated UI page request -> 307 redirect to /login
  const pageReq = new NextRequest("http://localhost:3001/bills?channel=TikTok");
  const pageRes = proxy(pageReq);
  assert.equal(pageRes.status, 307);
  assert.match(pageRes.headers.get("location") ?? "", /\/login\?next=%2Fbills%3Fchannel%3DTikTok/);
  assert.equal(pageRes.headers.get("x-frame-options"), "DENY");
  assert.equal(pageRes.headers.get("x-content-type-options"), "nosniff");

  // 2. Unauthenticated API request -> 401 JSON
  const apiReq = new NextRequest("http://localhost:3001/api/imports/1");
  const apiRes = proxy(apiReq);
  assert.equal(apiRes.status, 401);

  // 3. Health check endpoint -> allowed without session
  const healthReq = new NextRequest("http://localhost:3001/api/health");
  const healthRes = proxy(healthReq);
  assert.equal(healthRes.status, 200);

  // 4. Authenticated request -> allowed
  const validToken = createSessionToken({ username: "admin", role: "admin" });
  const authedReq = new NextRequest("http://localhost:3001/bills", {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(validToken)}`,
    },
  });
  const authedRes = proxy(authedReq);
  assert.equal(authedRes.status, 200);
});

test("PWA manifest, service worker, and icons are valid and publicly accessible via proxy", () => {
  const m = manifest();
  assert.equal(m.name, "PCMS Revenue");
  assert.equal(m.short_name, "PCMS Revenue");
  assert.equal(m.display, "standalone");
  assert.deepEqual(m.display_override, [
    "window-controls-overlay",
    "standalone",
    "minimal-ui",
  ]);
  assert.equal(m.start_url, "/");
  assert.equal(m.theme_color, "#0f1117");
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 4);

  const requiredPngs = [
    "public/icon-192.png",
    "public/icon-512.png",
    "public/icon-maskable-512.png",
    "public/apple-touch-icon.png",
  ];
  for (const relPath of requiredPngs) {
    const absPath = path.resolve(process.cwd(), relPath);
    assert.ok(fs.existsSync(absPath), `${relPath} must exist`);
    const buf = fs.readFileSync(absPath);
    // Verify PNG header bytes: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
  }

  const swPath = path.resolve(process.cwd(), "public/sw.js");
  assert.ok(fs.existsSync(swPath), "public/sw.js must exist");

  const pwaPaths = [
    "/manifest.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/apple-touch-icon.png",
  ];
  for (const p of pwaPaths) {
    const req = new NextRequest(`http://localhost:3001${p}`);
    const res = proxy(req);
    assert.equal(res.status, 200, `PWA asset ${p} must not redirect to /login`);
  }
});

test("blocks open redirect through /login?next= including the backslash bypass", () => {
  const token = createSessionToken({ username: "admin", role: "admin" });
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;

  for (const attack of ["/\\evil.com", "//evil.com", "https://evil.com", "/%2F%2Fevil.com"]) {
    const res = proxy(
      new NextRequest(`http://localhost:3001/login?next=${encodeURIComponent(attack)}`, {
        headers: { cookie },
      }),
    );
    assert.equal(res.status, 307);
    const location = res.headers.get("location") ?? "";
    assert.ok(
      location.startsWith("http://localhost:3001/"),
      `next=${attack} must stay on this host, got ${location}`,
    );
  }

  // เส้นทางปกติยังต้องทำงานเหมือนเดิม
  const ok = proxy(
    new NextRequest(
      `http://localhost:3001/login?next=${encodeURIComponent("/bills?channel=TikTok")}`,
      { headers: { cookie } },
    ),
  );
  assert.equal(ok.headers.get("location"), "http://localhost:3001/bills?channel=TikTok");
});

test("refuses the retired default credential of the seeheng account", () => {
  assert.equal(isRetiredDefaultCredential("seeheng", "seeheng"), true);
  assert.equal(isRetiredDefaultCredential("SEEHENG", "seeheng"), true);
  assert.equal(isRetiredDefaultCredential("seeheng", "seeheng-2026!"), false);
  assert.equal(isRetiredDefaultCredential("admin", "seeheng"), false);
});

test("never falls back to a hardcoded seeheng password when the env var is missing", async () => {
  const saved = process.env.AUTH_SEEHENG_PASSWORD;
  delete process.env.AUTH_SEEHENG_PASSWORD;
  try {
    await assert.rejects(() => getSeehengInitialPasswordHash(), /AUTH_SEEHENG_PASSWORD/);
  } finally {
    if (saved !== undefined) process.env.AUTH_SEEHENG_PASSWORD = saved;
  }
});

test("admin bootstrap fails closed instead of using a hardcoded hash", async () => {
  const savedHash = process.env.AUTH_PASSWORD_HASH;
  const savedPlain = process.env.AUTH_INITIAL_PASSWORD;
  delete process.env.AUTH_PASSWORD_HASH;
  delete process.env.AUTH_INITIAL_PASSWORD;
  try {
    await assert.rejects(() => getInitialPasswordHash(), /AUTH_PASSWORD_HASH/);
  } finally {
    if (savedHash !== undefined) process.env.AUTH_PASSWORD_HASH = savedHash;
    if (savedPlain !== undefined) process.env.AUTH_INITIAL_PASSWORD = savedPlain;
  }
});

test("company scope never comes from a client header", () => {
  const dbSource = fs.readFileSync(path.resolve(process.cwd(), "src/lib/db.ts"), "utf8");
  assert.ok(
    !dbSource.includes("x-auth-company"),
    "src/lib/db.ts ต้องไม่เชื่อ header x-auth-company จาก client",
  );
});

test("production CSP does not allow eval", (t) => {
  if (process.env.NODE_ENV !== "production") {
    // dev ต้องเปิด unsafe-eval ให้ Turbopack — CSP ของ prod ยืนยันจาก header จริงตอน deploy
    t.skip("ตรวจเฉพาะโหมด production");
    return;
  }
  const csp = SECURITY_HEADERS["Content-Security-Policy"] ?? "";
  assert.ok(!csp.includes("unsafe-eval"), "CSP ของ production ต้องไม่เปิด unsafe-eval");
});
