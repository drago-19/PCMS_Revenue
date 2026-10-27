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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();

  // Allow Next.js static assets and icons
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
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
          { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน (CSRF Protection)", requestId },
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
      const safeTarget =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/";
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
          { error: "ไม่อนุญาตให้ส่งคำขอข้ามโดเมน (CSRF Protection)", requestId },
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

  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    requestId,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
