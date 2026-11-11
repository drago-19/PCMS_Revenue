import { getActiveCompanyId } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth";
import { clearDayOrdersCache } from "@/lib/shipnity/cache";
import {
  addShipnityAccount,
  getShipnityConnectionStatus,
  normalizeAccountInput,
  verifyShipnityAccount,
} from "@/lib/shipnity/config";
import { ShipnityLoginError, loginToShipnity } from "@/lib/shipnity/login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

/**
 * ล็อกอิน Shipnity แทนผู้ใช้ แล้วเก็บ token ของบัญชีนั้นเป็น "บัญชี Shipnity" ของบริษัท
 * รหัสผ่านถูกใช้ครั้งเดียวในคำขอนี้ ไม่ถูกบันทึกลงฐานข้อมูลหรือ log
 */
export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด", requestId: auth.requestId }, 413, auth.requestId);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: auth.requestId }, 400, auth.requestId);
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";

  if (!email || !password) {
    return json(
      { error: "กรอกอีเมลและรหัสผ่าน Shipnity ให้ครบ", requestId: auth.requestId },
      400,
      auth.requestId,
    );
  }

  try {
    const session = await loginToShipnity(email, password);
    const normalized = normalizeAccountInput({
      label: label || session.shopName || session.email,
      email: session.email,
      token: session.token,
    });
    const visibleOrders = await verifyShipnityAccount(normalized);
    const result = await addShipnityAccount(normalized, auth.session.sub);
    clearDayOrdersCache();

    return json(
      {
        ok: true,
        accounts: result.accounts,
        added: result.added,
        shopName: session.shopName,
        visibleOrders,
        requestId: auth.requestId,
      },
      200,
      auth.requestId,
    );
  } catch (error) {
    if (error instanceof ShipnityLoginError) {
      return json({ error: error.message, requestId: auth.requestId }, 400, auth.requestId);
    }
    const message = error instanceof Error ? error.message : "เชื่อมต่อ Shipnity ไม่สำเร็จ";
    return json({ error: message, requestId: auth.requestId }, 400, auth.requestId);
  }
}

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const companyId = await getActiveCompanyId();
  const status = await getShipnityConnectionStatus(companyId);
  return json({ ok: true, status }, 200, auth.requestId);
}
