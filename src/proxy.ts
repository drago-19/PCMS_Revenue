import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  SECURITY_HEADERS,
  SESSION_COOKIE_NAME,
  verifyCsrfOrigin,
  verifySessionToken,
} from "@/lib/session-token";

function applySecurityHeaders(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * ปลายทางหลังล็อกอินต้องอยู่โดเมนนี้เท่านั้น — กัน `//evil.com` และ `/\evil.com`
 * ที่ new URL() ตีความ backslash เป็น slash แล้วกลายเป็น host ภายนอก
 */
function safeRedirectTarget(rawTarget: string | null, baseUrl: string): string {
  if (!rawTarget || !rawTarget.startsWith("/") || rawTarget.startsWith("//")) {
    return "/";
  }
  try {
    const target = new URL(rawTarget, baseUrl);
    if (target.host !== new URL(baseUrl).host) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();

  // Allow Next.js static assets, PWA manifest, service worker, and icons
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname === "/icon-maskable-512.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt"
  ) {
    return applySecurityHeaders(NextResponse.next(), requestId);
  }

  // Public health check endpoint (Observability standard)
  if (pathname === "/api/health") {
    return applySecurityHeaders(NextResponse.next(), requestId);
  }

  // Public auth endpoints (login / logout)
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") {
    const csrf = verifyCsrfOrigin(request);
    if (!csrf.ok) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน", requestId },
          { status: 403 },
        ),
        requestId,
      );
    }
    return applySecurityHeaders(NextResponse.next(), requestId);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  // Login page handling
  if (pathname === "/login") {
    if (session) {
      const nextParam = request.nextUrl.searchParams.get("next");
      const safeTarget = safeRedirectTarget(nextParam, request.url);
      return applySecurityHeaders(
        NextResponse.redirect(new URL(safeTarget, request.url)),
        requestId,
      );
    }
    return applySecurityHeaders(NextResponse.next(), requestId);
  }

  // Protect all API routes
  if (pathname.startsWith("/api/")) {
    const csrf = verifyCsrfOrigin(request);
    if (!csrf.ok) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน", requestId },
          { status: 403 },
        ),
        requestId,
      );
    }

    if (!session) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "กรุณาเข้าสู่ระบบก่อนใช้งาน", requestId },
          { status: 401 },
        ),
        requestId,
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-auth-user", session.sub);
    requestHeaders.set("x-auth-role", session.role);
    requestHeaders.set("x-auth-company", session.companyId ?? "dragon19");

    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      requestId,
    );
  }

  // Protect all UI pages
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    const fullTarget = `${pathname}${search}`;
    if (fullTarget && fullTarget !== "/") {
      loginUrl.searchParams.set("next", fullTarget);
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl), requestId);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-auth-user", session.sub);
  requestHeaders.set("x-auth-role", session.role);
  requestHeaders.set("x-auth-company", session.companyId ?? "dragon19");

  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    requestId,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png|manifest.webmanifest|manifest.json|sw.js|api/imports).*)",
  ],
};
