import { requireApiAuth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { parseShipnityAccounts } from "@/lib/shipnity/config";
import { encryptSecret, isEncryptionConfigured } from "@/lib/platform/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTING_KEY = "shipnity_api";

/**
 * เพิ่มบัญชี Shipnity จากหน้าฝ่ายขาย
 * เก็บรวมที่ public.app_settings พร้อม companyKey เพื่อให้ทุกบริษัทเห็นรายการเดียวกัน
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  let body: { label?: unknown; email?: unknown; token?: unknown; company?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const company = body.company === "seeheng" ? "seeheng" : "dragon19";

  if (!label || !email || token.length < 8) {
    return Response.json(
      { error: "ต้องกรอกชื่อบัญชี อีเมล และ token (อย่างน้อย 8 ตัวอักษร)" },
      { status: 400, headers: { "x-request-id": auth.requestId } },
    );
  }
  if (!isEncryptionConfigured()) {
    return Response.json({ error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งคีย์เข้ารหัส" }, { status: 500 });
  }

  const row = await queryOne<{ value_json: unknown }>(
    `SELECT value_json FROM public.app_settings WHERE setting_key = $1`,
    [SETTING_KEY],
  );
  const accounts = parseShipnityAccounts(row?.value_json);
  if (accounts.some((account) => account.email.toLowerCase() === email.toLowerCase())) {
    return Response.json({ error: "อีเมลนี้มีบัญชีอยู่แล้ว" }, { status: 409 });
  }

  const next = [
    ...accounts,
    {
      id: `acct-${Date.now()}`,
      label,
      email,
      token: encryptSecret(token),
      companyKey: company,
    },
  ];

  await query(
    `INSERT INTO public.app_settings (setting_key, value_json, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (setting_key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [SETTING_KEY, JSON.stringify({ accounts: next }), auth.session.sub],
  );

  return Response.json({ ok: true, count: next.length, requestId: auth.requestId });
}
