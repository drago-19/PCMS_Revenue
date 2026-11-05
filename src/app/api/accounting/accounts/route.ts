import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/auth";
import {
  createChartOfAccount,
  deleteChartOfAccount,
  listChartOfAccounts,
  updateChartOfAccount,
  type AccountType,
  type NormalBalance,
} from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const accounts = await listChartOfAccounts();
    return Response.json(
      { ok: true, accounts, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[GET /api/accounting/accounts] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูลผังบัญชีได้", requestId: auth.requestId },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const account = await createChartOfAccount({
      accountCode: String(body.accountCode || ""),
      accountName: String(body.accountName || ""),
      description: String(body.description || ""),
      accountType: body.accountType as AccountType | undefined,
      primaryGroup: String(body.primaryGroup || ""),
      secondaryGroup: String(body.secondaryGroup || ""),
      normalBalance: body.normalBalance as NormalBalance | undefined,
    });
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, account, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    console.error("[POST /api/accounting/accounts] failed", {
      requestId: auth.requestId,
      message: err instanceof Error ? err.message : "unknown_error",
    });
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถบันทึกผังบัญชีได้",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function PUT(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) {
      return Response.json(
        { error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId },
        { status: 413, headers: { "x-request-id": auth.requestId } },
      );
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  const id = Number(body.id);
  if (!id || isNaN(id)) {
    return Response.json(
      { error: "ไม่พบรหัสบัญชีที่ต้องการแก้ไข", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const account = await updateChartOfAccount(id, {
      accountCode: String(body.accountCode || ""),
      accountName: String(body.accountName || ""),
      description: String(body.description || ""),
      accountType: body.accountType as AccountType | undefined,
      primaryGroup: String(body.primaryGroup || ""),
      secondaryGroup: String(body.secondaryGroup || ""),
      normalBalance: body.normalBalance as NormalBalance | undefined,
    });
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, account, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถแก้ไขผังบัญชีได้",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!id || isNaN(id)) {
    return Response.json(
      { error: "กรุณาระบุรายการผังบัญชีที่ต้องการลบ", requestId: auth.requestId },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }

  try {
    const deleted = await deleteChartOfAccount(id);
    if (!deleted) {
      return Response.json(
        {
          error: "ไม่สามารถลบบัญชีมาตรฐานของระบบได้ (ลบได้เฉพาะบัญชีที่เพิ่มเอง)",
          requestId: auth.requestId,
        },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }
    revalidatePath("/accounting");
    return Response.json(
      { ok: true, requestId: auth.requestId },
      { status: 200, headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "ไม่สามารถลบผังบัญชีได้",
        requestId: auth.requestId,
      },
      { status: 500, headers: { "x-request-id": auth.requestId } },
    );
  }
}
