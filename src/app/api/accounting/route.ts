import { requireApiAuth } from "@/lib/auth";
import { getAccountingOverview } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || url.searchParams.get("year") || "all";

  try {
    const data = await getAccountingOverview(period);
    return Response.json(
      { ok: true, data, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[GET /api/accounting] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: "ไม่สามารถดึงข้อมูลระบบบริหารบัญชีได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
