import { recordAuditLog, requireApiAuth } from "@/lib/auth";
import {
  getColumnMappingRules,
  saveColumnMappingRules,
  type UnknownColumnCategory,
} from "@/lib/column-mapping-settings";
import { reapplyColumnRulesToImport } from "@/lib/ingest/import-service";
import { checkApiRateLimit } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const rules = await getColumnMappingRules();
  return Response.json(
    { ok: true, rules, requestId: auth.requestId },
    { headers: { "x-request-id": auth.requestId } },
  );
}

export async function PUT(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const rate = checkApiRateLimit(`column_mappings_write:${auth.ip}`, 30, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: "ส่งคำขอถี่เกินกำหนด กรุณารอสักครู่", requestId: auth.requestId },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "x-request-id": auth.requestId,
        },
      },
    );
  }

  try {
    const body = (await request.json()) as {
      headerToFieldKey?: Record<string, string>;
      unknownColumnCategories?: Record<string, UnknownColumnCategory | "">;
      replaceAll?: boolean;
      importId?: number;
      reapplyAll?: boolean;
    };

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { error: "ข้อมูลการตั้งค่าไม่ถูกต้อง", requestId: auth.requestId },
        { status: 400, headers: { "x-request-id": auth.requestId } },
      );
    }

    const saved = await saveColumnMappingRules(
      {
        headerToFieldKey: body.headerToFieldKey,
        unknownColumnCategories: body.unknownColumnCategories,
        replaceAll: Boolean(body.replaceAll),
      },
      auth.session.sub,
    );

    let recalculated = { updatedImports: 0, updatedTransactions: 0 };
    if (body.unknownColumnCategories || body.reapplyAll || body.importId) {
      const targetId =
        typeof body.importId === "number" && Number.isFinite(body.importId) && body.importId > 0
          ? body.importId
          : undefined;
      recalculated = await reapplyColumnRulesToImport(
        body.reapplyAll ? undefined : targetId,
      );
    }

    await recordAuditLog({
      actor: auth.session.sub,
      action: "settings.column_mapping.update",
      ipAddress: auth.ip,
      outcome: "success",
      details: {
        headerRuleCount: Object.keys(saved.headerToFieldKey).length,
        categoryRuleCount: Object.keys(saved.unknownColumnCategories).length,
        updatedImports: recalculated.updatedImports,
        updatedTransactions: recalculated.updatedTransactions,
      },
      requestId: auth.requestId,
    });

    return Response.json(
      {
        ok: true,
        rules: saved,
        recalculated,
        requestId: auth.requestId,
      },
      { headers: { "x-request-id": auth.requestId } },
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "ไม่สามารถบันทึกการตั้งค่าการจับคู่คอลัมน์ได้",
        requestId: auth.requestId,
      },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const rate = checkApiRateLimit(`column_mappings_write:${auth.ip}`, 30, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: "ส่งคำขอถี่เกินกำหนด กรุณารอสักครู่", requestId: auth.requestId },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "x-request-id": auth.requestId,
        },
      },
    );
  }

  const url = new URL(request.url);
  const headerToDelete = url.searchParams.get("header")?.trim() ?? "";
  const categoryToDelete = url.searchParams.get("categoryHeader")?.trim() ?? "";

  const saved = await saveColumnMappingRules(
    {
      headerToFieldKey: headerToDelete ? { [headerToDelete]: "" } : undefined,
      unknownColumnCategories: categoryToDelete
        ? { [categoryToDelete]: "" }
        : undefined,
    },
    auth.session.sub,
  );

  if (categoryToDelete) {
    await reapplyColumnRulesToImport();
  }

  await recordAuditLog({
    actor: auth.session.sub,
    action: "settings.column_mapping.delete",
    ipAddress: auth.ip,
    outcome: "success",
    details: { headerToDelete, categoryToDelete },
    requestId: auth.requestId,
  });

  return Response.json(
    { ok: true, rules: saved, requestId: auth.requestId },
    { headers: { "x-request-id": auth.requestId } },
  );
}
