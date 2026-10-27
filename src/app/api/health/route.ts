import crypto from "node:crypto";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const row = await queryOne<{ ok: number }>("SELECT 1 AS ok");
    const latencyMs = Date.now() - startedAt;
    if (Number(row?.ok) === 1) {
      return Response.json(
        {
          status: "ok",
          timestamp: new Date().toISOString(),
          latencyMs,
          requestId,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-request-id": requestId,
          },
        },
      );
    }
    return Response.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        requestId,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    console.error("health check degraded", {
      requestId,
      error: error instanceof Error ? error.message : "db_unreachable",
    });
    return Response.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        requestId,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  }
}
