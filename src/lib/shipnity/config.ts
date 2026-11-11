// เก็บ/อ่าน credential ของ Shipnity แยกตามบริษัท — หนึ่งบริษัทมีได้หลายบัญชี (หลายร้าน)
//
// เก็บในตาราง app_settings (คีย์ shipnity_api) ซึ่งแยกตามบริษัทอยู่แล้วผ่าน schema/search_path
// รูปแบบ value: { accounts: [{ id, label, email, token }] }
// รองรับข้อมูลเก่าที่เคยเก็บเป็น { email, token } เดี่ยว ๆ โดยแปลงให้เป็นหนึ่งบัญชี

import type { CompanyId } from "@/lib/db";
import { query, queryOne } from "@/lib/db";
import {
  fetchOrdersPage,
  shipnityCredentialsFromEnv,
  type ShipnityCredentials,
} from "@/lib/shipnity/client";

const SETTING_KEY = "shipnity_api";

export interface ShipnityAccount {
  id: string;
  label: string;
  email: string;
  token: string;
}

/** ข้อมูลบัญชีที่ไม่มีความลับ ใช้ส่งไปหน้าจอ */
export interface ShipnityAccountPublic {
  id: string;
  label: string;
  email: string;
}

export interface ConnectedShipnityAccount extends ShipnityCredentials {
  id: string;
  label: string;
  source: "db" | "env";
}

export interface ShipnityConnectionStatus {
  connected: boolean;
  accounts: ShipnityAccountPublic[];
  source: "db" | "env" | null;
  updatedAt: string | null;
}

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, "").trim().slice(0, maxLength);
}

function normalizeAccount(raw: unknown, index: number): ShipnityAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const email = clean(data.email, 200);
  const token = clean(data.token, 500);
  if (!email || !token) return null;
  const label = clean(data.label, 120) || email;
  const id = clean(data.id, 60) || `acct-${index + 1}`;
  return { id, label, email, token };
}

/** แปลง value_json ที่เก็บไว้เป็นรายการบัญชี (รองรับรูปแบบเดี่ยวเดิม) */
export function parseShipnityAccounts(value: unknown): ShipnityAccount[] {
  if (!value) return [];
  let data: unknown = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.accounts)) {
    return record.accounts
      .map((item, index) => normalizeAccount(item, index))
      .filter((item): item is ShipnityAccount => item !== null);
  }

  const single = normalizeAccount(record, 0);
  return single ? [single] : [];
}

/** บัญชีที่กรอกไว้ในระบบของบริษัทที่กำลังใช้งานอยู่ */
export async function getStoredShipnityAccounts(): Promise<{
  accounts: ShipnityAccount[];
  updatedAt: string | null;
}> {
  try {
    const row = await queryOne<{ value_json: unknown; updated_at: string | null }>(
      "SELECT value_json, updated_at::text AS updated_at FROM app_settings WHERE setting_key = $1",
      [SETTING_KEY],
    );
    if (!row?.value_json) return { accounts: [], updatedAt: null };
    return { accounts: parseShipnityAccounts(row.value_json), updatedAt: row.updated_at };
  } catch {
    // ฐานข้อมูลยังไม่พร้อม (เช่นระหว่าง build) — ถือว่ายังไม่ได้ตั้งค่า
    return { accounts: [], updatedAt: null };
  }
}

/** บัญชีทั้งหมดที่ใช้ได้จริง: ค่าที่กรอกในระบบก่อน ถ้าไม่มีจึงใช้ .env */
export async function resolveShipnityAccounts(
  companyId: CompanyId,
): Promise<ConnectedShipnityAccount[]> {
  const stored = await getStoredShipnityAccounts();
  if (stored.accounts.length > 0) {
    return stored.accounts.map((account) => ({
      id: account.id,
      label: account.label,
      email: account.email,
      token: account.token,
      source: "db" as const,
    }));
  }

  const fromEnv = shipnityCredentialsFromEnv(companyId);
  if (fromEnv) {
    return [
      {
        id: "env",
        label: fromEnv.email,
        email: fromEnv.email,
        token: fromEnv.token,
        source: "env",
      },
    ];
  }
  return [];
}

/** สถานะการเชื่อมต่อสำหรับแสดงบนหน้าจอ (ไม่คืน token ออกไป) */
export async function getShipnityConnectionStatus(
  companyId: CompanyId,
): Promise<ShipnityConnectionStatus> {
  const stored = await getStoredShipnityAccounts();
  if (stored.accounts.length > 0) {
    return {
      connected: true,
      accounts: stored.accounts.map(({ id, label, email }) => ({ id, label, email })),
      source: "db",
      updatedAt: stored.updatedAt,
    };
  }

  const fromEnv = shipnityCredentialsFromEnv(companyId);
  if (fromEnv) {
    return {
      connected: true,
      accounts: [{ id: "env", label: fromEnv.email, email: fromEnv.email }],
      source: "env",
      updatedAt: null,
    };
  }
  return { connected: false, accounts: [], source: null, updatedAt: null };
}

export interface AddShipnityAccountInput {
  label?: unknown;
  email?: unknown;
  token?: unknown;
}

/** เพิ่มบัญชี Shipnity ของบริษัทที่กำลังใช้งานอยู่ (แก้บัญชีเดิมถ้าอีเมลซ้ำ) */
export interface NormalizedAccountInput {
  label: string;
  email: string;
  token: string;
}

/** ตรวจความถูกต้องของอีเมล/token ก่อนนำไปใช้ */
export function normalizeAccountInput(input: AddShipnityAccountInput): NormalizedAccountInput {
  const email = clean(input.email, 200);
  const token = clean(input.token, 500);
  const label = clean(input.label, 120);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("อีเมลที่ใช้ล็อกอิน Shipnity ไม่ถูกต้อง");
  }
  if (token.length < 20) {
    throw new Error("token ของ Shipnity สั้นเกินไป (คัดลอกมาทั้งหมดหรือยัง)");
  }
  return { label, email, token };
}

/** ทดสอบ credential กับ Shipnity จริงก่อนบันทึก — คืนจำนวนออเดอร์ที่เห็น */
export async function verifyShipnityAccount(input: NormalizedAccountInput): Promise<number> {
  const page = await fetchOrdersPage({
    credentials: { email: input.email, token: input.token },
    filter: "open",
    page: 1,
  });
  return page.orders.length;
}

export async function addShipnityAccount(
  input: AddShipnityAccountInput,
  updatedBy: string,
): Promise<{ accounts: ShipnityAccountPublic[]; added: ShipnityAccountPublic }> {
  const { email, token, label } = normalizeAccountInput(input);

  const stored = await getStoredShipnityAccounts();
  const existing = stored.accounts.filter((account) => account.email !== email);
  const account: ShipnityAccount = {
    id: `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: label || email,
    email,
    token,
  };
  const next = [...existing, account];

  await query(
    `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (setting_key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [SETTING_KEY, JSON.stringify({ accounts: next }), updatedBy],
  );

  return {
    accounts: next.map(({ id, label: accountLabel, email: accountEmail }) => ({
      id,
      label: accountLabel,
      email: accountEmail,
    })),
    added: { id: account.id, label: account.label, email: account.email },
  };
}

/** ลบบัญชีตาม id (ถ้าไม่ส่ง id มา = ลบทั้งหมด) */
export async function removeShipnityAccount(id?: string): Promise<void> {
  if (!id) {
    await query("DELETE FROM app_settings WHERE setting_key = $1", [SETTING_KEY]);
    return;
  }

  const stored = await getStoredShipnityAccounts();
  const next = stored.accounts.filter((account) => account.id !== id);
  if (next.length === 0) {
    await query("DELETE FROM app_settings WHERE setting_key = $1", [SETTING_KEY]);
    return;
  }

  await query(
    `UPDATE app_settings SET value_json = $2::jsonb, updated_at = now(), updated_by = 'system'
     WHERE setting_key = $1`,
    [SETTING_KEY, JSON.stringify({ accounts: next })],
  );
}
