import { requireApiAuth } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import { parseShipnityAccounts } from "@/lib/shipnity/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTING_KEY = "shipnity_api";

/**
 * กำหนดบริษัทให้บัญชี Shipnity (ดราก้อน 19 / ชีเฮง)
 * บัญชีถูกเก็บเป็นชุดใน app_settings — เขียนกลับทั้งชุดโดยไม่แตะโทเคนที่เข้ารหัสไว้
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { accountId?: unknown; company?: unknown } = {};
  try {
    body = (await request.json()) as { accountId?: unknown; company?: unknown };
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim().slice(0, 60) : "";
  const company = body.company === "seeheng" ? "seeheng" : body.company === "dragon19" ? "dragon19" : null;
  if (!accountId || !company) {
    return Response.json({ error: "ต้องระบุบัญชีและบริษัท", requestId: auth.requestId }, { status: 400 });
  }

  const row = await queryOne<{ value_json: unknown }>(
    `SELECT value_json FROM public.app_settings WHERE setting_key = $1`,
    [SETTING_KEY],
  );
  const accounts = parseShipnityAccounts(row?.value_json);
  if (!accounts.some((account) => account.id === accountId)) {
    return Response.json({ error: "ไม่พบบัญชีนี้", requestId: auth.requestId }, { status: 404 });
  }

  const next = accounts.map((account) => (account.id === accountId ? { ...account, companyKey: company } : account));
  await query(
    `UPDATE public.app_settings SET value_json = $2::jsonb, updated_at = now() WHERE setting_key = $1`,
    [SETTING_KEY, JSON.stringify({ accounts: next })],
  );

  return Response.json({ ok: true, accountId, company, requestId: auth.requestId });
}
