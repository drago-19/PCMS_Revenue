// เก็บ/อ่านค่าตั้งค่าการเชื่อมต่อแพลตฟอร์ม (แยกตามบริษัทผ่าน schema เดิม)
//
// - credential ของ "แอป" (app_key / app_secret / service_id) เก็บใน app_settings คีย์ platform_api
// - token ของ "ร้านที่ authorize แล้ว" เก็บในตาราง platform_accounts
// ไม่อ่าน/ไม่เขียนตารางของระบบบิลเดิมเลย

import { query, queryOne } from "@/lib/db";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
  isEncryptionConfigured,
} from "@/lib/platform/secrets";
import type { TikTokAppConfig, TikTokShop } from "@/lib/platform/tiktok";
import {
  normalizeShopeeEnv,
  type ShopeeAppConfig,
  type ShopeeEnvironment,
} from "@/lib/platform/shopee";

const SETTINGS_KEY = "platform_api";
export const TIKTOK_PLATFORM = "TikTok";
export const SHOPEE_PLATFORM = "Shopee";

/** ร้านที่เลือกใช้เป็นค่าเริ่มต้น (ร้านจริงหรือร้านทดสอบ) — เก็บใน app_settings เดียวกัน */
export async function getActiveShopId(platform: string): Promise<string | null> {
  const { raw } = await readRawSettingsRow();
  const active = raw.activeShop;
  if (!active || typeof active !== "object") return null;
  const value = (active as Record<string, unknown>)[platform];
  return typeof value === "string" && value ? value : null;
}

/** เวลาที่สมัคร webhook กับ TikTok สำเร็จครั้งล่าสุด (ไว้แสดงว่าสมัครแล้ว) */
export async function getWebhookRegisteredAt(platform: string): Promise<string | null> {
  const { raw } = await readRawSettingsRow();
  const value = raw[`webhookRegisteredAt_${platform}`];
  return typeof value === "string" && value ? value : null;
}

export async function setWebhookRegisteredAt(platform: string, at: string): Promise<void> {
  await query(
    `UPDATE app_settings
        SET value_json = jsonb_set(COALESCE(value_json, '{}'::jsonb), ARRAY[$2::text], to_jsonb($3::text), true),
            updated_at = now()
      WHERE setting_key = $1`,
    [SETTINGS_KEY, `webhookRegisteredAt_${platform}`, at],
  );
}

export async function setActiveShopId(platform: string, shopId: string): Promise<void> {
  // jsonb_set สร้างคีย์ซ้อนชั้นไม่ได้ — ต้องสร้าง activeShop เป็น object ก่อนแล้วค่อยใส่ค่าร้าน
  await query(
    `UPDATE app_settings
        SET value_json = jsonb_set(
              jsonb_set(
                COALESCE(value_json, '{}'::jsonb),
                '{activeShop}',
                COALESCE(value_json -> 'activeShop', '{}'::jsonb),
                true
              ),
              ARRAY['activeShop', $2::text],
              to_jsonb($3::text),
              true
            ),
            updated_at = now()
      WHERE setting_key = $1`,
    [SETTINGS_KEY, platform, shopId],
  );
}

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]/g, "").trim().slice(0, max)
    : "";
}

export interface StoredPlatformConfig {
  tiktok: TikTokAppConfig | null;
  shopee: ShopeeAppConfig | null;
  updatedAt: string | null;
}

async function readRawSettingsRow(): Promise<{
  raw: Record<string, unknown>;
  updatedAt: string | null;
}> {
  const row = await queryOne<{ value_json: unknown; updated_at: string | null }>(
    "SELECT value_json, updated_at::text AS updated_at FROM app_settings WHERE setting_key = $1",
    [SETTINGS_KEY],
  );
  const raw =
    row?.value_json && typeof row.value_json === "object"
      ? (row.value_json as Record<string, unknown>)
      : {};
  return { raw, updatedAt: row?.updated_at ?? null };
}

async function resolveEncryptedSecret(
  storedValue: string,
  jsonPath: string,
): Promise<string> {
  if (!storedValue) return "";
  let plain = "";
  try {
    plain = decryptSecret(storedValue);
  } catch {
    // คีย์ไม่ตรงหรือยังไม่ได้ตั้งคีย์ — ให้หน้าเว็บเห็นว่ายังใช้งานไม่ได้ ดีกว่าโยน error ทั้งหน้า
    return "";
  }

  if (plain && !isEncryptedValue(storedValue) && isEncryptionConfigured()) {
    try {
      await query(
        `UPDATE app_settings
         SET value_json = jsonb_set(value_json, $2::text[], to_jsonb($3::text)),
             updated_at = now()
         WHERE setting_key = $1`,
        [SETTINGS_KEY, jsonPath, encryptSecret(plain)],
      );
    } catch {
      // เข้ารหัสซ้ำไม่สำเร็จไม่ควรทำให้อ่านค่าไม่ได้
    }
  }
  return plain;
}

export async function getPlatformConfig(): Promise<StoredPlatformConfig> {
  try {
    const { raw, updatedAt } = await readRawSettingsRow();

    const tiktokRaw = raw.tiktok as Record<string, unknown> | undefined;
    const appKey = clean(tiktokRaw?.appKey, 200);
    const storedTikTokSecret = clean(tiktokRaw?.appSecret, 4000);
    const serviceId = clean(tiktokRaw?.serviceId, 200);
    const appSecret = await resolveEncryptedSecret(storedTikTokSecret, "{tiktok,appSecret}");

    const shopeeRaw = raw.shopee as Record<string, unknown> | undefined;
    const partnerId = clean(shopeeRaw?.partnerId, 50);
    const storedShopeeKey = clean(shopeeRaw?.partnerKey, 4000);
    const env = normalizeShopeeEnv(shopeeRaw?.env);
    const redirectBaseUrl = clean(shopeeRaw?.redirectBaseUrl, 500) || null;
    const partnerKey = await resolveEncryptedSecret(storedShopeeKey, "{shopee,partnerKey}");

    return {
      tiktok: appKey && appSecret && serviceId ? { appKey, appSecret, serviceId } : null,
      shopee:
        partnerId && partnerKey
          ? { partnerId, partnerKey, env, redirectBaseUrl }
          : null,
      updatedAt,
    };
  } catch {
    // ฐานข้อมูลยังไม่พร้อม (ระหว่าง build) — ถือว่ายังไม่ตั้งค่า
    return { tiktok: null, shopee: null, updatedAt: null };
  }
}

export interface SaveTikTokConfigInput {
  appKey?: unknown;
  appSecret?: unknown;
  serviceId?: unknown;
}

export async function saveTikTokConfig(
  input: SaveTikTokConfigInput,
  updatedBy: string,
): Promise<TikTokAppConfig> {
  // production ห้ามเก็บ credential แบบข้อความธรรมดา — ถ้ายังไม่มีคีย์ให้หยุดก่อน
  if (process.env.NODE_ENV === "production" && !isEncryptionConfigured()) {
    throw new Error(
      "ต้องตั้งค่า PLATFORM_SECRET_KEY (base64 32 ไบต์) ก่อนบันทึก credential ใน production",
    );
  }

  const appKey = clean(input.appKey, 200);
  const appSecret = clean(input.appSecret, 500);
  const serviceId = clean(input.serviceId, 200);

  if (!appKey) throw new Error("ยังไม่ได้กรอก App Key");
  if (appSecret.length < 20) throw new Error("App Secret สั้นเกินไป — คัดลอกมาครบหรือยัง");
  if (!serviceId) throw new Error("ยังไม่ได้กรอก Service ID");

  const { raw } = await readRawSettingsRow();
  const prevTikTok =
    raw.tiktok && typeof raw.tiktok === "object"
      ? (raw.tiktok as Record<string, unknown>)
      : {};
  const next = {
    ...prevTikTok,
    appKey,
    // เก็บเฉพาะข้อความที่เข้ารหัสแล้ว — คีย์ถอดรหัสอยู่ใน env ไม่ได้อยู่ในฐานข้อมูล
    appSecret: encryptSecret(appSecret),
    serviceId,
  };

  await query(
    `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (setting_key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify({ ...raw, tiktok: next }), updatedBy],
  );

  return { appKey, appSecret, serviceId };
}

export interface SaveShopeeConfigInput {
  partnerId?: unknown;
  partnerKey?: unknown;
  env?: unknown;
  redirectBaseUrl?: unknown;
}

export async function saveShopeeConfig(
  input: SaveShopeeConfigInput,
  updatedBy: string,
): Promise<ShopeeAppConfig> {
  if (process.env.NODE_ENV === "production" && !isEncryptionConfigured()) {
    throw new Error(
      "ต้องตั้งค่า PLATFORM_SECRET_KEY (base64 32 ไบต์) ก่อนบันทึก credential ใน production",
    );
  }

  const partnerId = clean(input.partnerId, 50);
  const partnerKeyInput = clean(input.partnerKey, 500);
  const env: ShopeeEnvironment = normalizeShopeeEnv(input.env);
  const rawRedirect = clean(input.redirectBaseUrl, 500);

  if (!/^\d+$/.test(partnerId)) {
    throw new Error("Partner ID ต้องเป็นตัวเลขเท่านั้น");
  }

  let redirectBaseUrl: string | null = null;
  if (rawRedirect) {
    let parsed: URL;
    try {
      parsed = new URL(rawRedirect);
    } catch {
      throw new Error("Redirect Domain ต้องขึ้นต้นด้วย http:// หรือ https://");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Redirect Domain ต้องใช้ http:// หรือ https:// เท่านั้น");
    }
    redirectBaseUrl = parsed.origin;
  }

  const existing = await getPlatformConfig();
  const partnerKey = partnerKeyInput || existing.shopee?.partnerKey || "";
  if (partnerKey.length < 20) {
    throw new Error("Partner Key สั้นเกินไป — คัดลอกมาครบหรือยัง");
  }

  const { raw } = await readRawSettingsRow();
  const prevShopee =
    raw.shopee && typeof raw.shopee === "object"
      ? (raw.shopee as Record<string, unknown>)
      : {};
  const next = {
    ...prevShopee,
    partnerId,
    partnerKey: encryptSecret(partnerKey),
    env,
    redirectBaseUrl,
  };

  await query(
    `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (setting_key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify({ ...raw, shopee: next }), updatedBy],
  );

  return { partnerId, partnerKey, env, redirectBaseUrl };
}

export interface PlatformAccountRow {
  id: number;
  platform: string;
  accountKey: string;
  shopId: string | null;
  shopCipher: string | null;
  shopName: string | null;
  sellerName: string | null;
  region: string | null;
  grantedScopes: string[];
  status: string;
  lastError: string | null;
  accessTokenExpiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string;
}

/** ข้อมูลที่ส่งให้หน้าจอ — ห้ามมี token หลุดออกไป */
export type PlatformAccountPublic = Omit<PlatformAccountRow, "id">;

const ACCOUNT_COLUMNS = `
  platform,
  account_key AS "accountKey",
  shop_id AS "shopId",
  shop_cipher AS "shopCipher",
  shop_name AS "shopName",
  seller_name AS "sellerName",
  region,
  granted_scopes AS "grantedScopes",
  status,
  last_error AS "lastError",
  access_token_expires_at::text AS "accessTokenExpiresAt",
  connected_at::text AS "connectedAt",
  updated_at::text AS "updatedAt"
`;

export async function listPlatformAccounts(platform: string): Promise<PlatformAccountPublic[]> {
  try {
    return await query<PlatformAccountPublic>(
      `SELECT ${ACCOUNT_COLUMNS} FROM platform_accounts WHERE platform = $1 ORDER BY updated_at DESC`,
      [platform],
    );
  } catch {
    return [];
  }
}

/** รายชื่อแพลตฟอร์มที่มีร้าน status='connected' อยู่จริง (ใช้เปิด/ปิดแท็บใน /platform) */
export async function getConnectedPlatforms(): Promise<Array<"tiktok" | "shopee" | "facebook">> {
  try {
    const rows = await query<{ platform: string }>(
      `SELECT DISTINCT platform FROM platform_accounts WHERE status = 'connected'`,
    );
    const out = new Set<"tiktok" | "shopee" | "facebook">(["tiktok"]);
    for (const row of rows) {
      if (row.platform === "Shopee") out.add("shopee");
      if (row.platform === "Facebook") out.add("facebook");
    }
    return [...out];
  } catch {
    return ["tiktok"];
  }
}

/**
 * ถอดรหัสโทเคนที่อ่านจากฐานข้อมูล — แถวเก่าที่ยังเป็นข้อความธรรมดาจะถูกเข้ารหัส
 * เก็บกลับให้อัตโนมัติเมื่อมีคีย์ (ครั้งเดียวต่อแถว ไม่บล็อกคำขอ)
 */
function readStoredToken(
  value: string | null,
  platform: string,
  accountKey: string,
  column: "access_token" | "refresh_token",
): string | null {
  if (!value) return value;
  if (isEncryptedValue(value)) return decryptSecret(value);

  if (isEncryptionConfigured()) {
    void query(
      `UPDATE platform_accounts SET ${column} = $3 WHERE platform = $1 AND account_key = $2`,
      [platform, accountKey, encryptSecret(value)],
    ).catch(() => {});
  }
  return value;
}

export async function getPlatformAccountRow(
  platform: string,
  accountKey: string,
): Promise<(PlatformAccountPublic & { accessToken: string | null; refreshToken: string | null }) | null> {
  try {
    const row = await queryOne<
      PlatformAccountPublic & { accessToken: string | null; refreshToken: string | null }
    >(
      `SELECT ${ACCOUNT_COLUMNS}, access_token AS "accessToken", refresh_token AS "refreshToken"
       FROM platform_accounts WHERE platform = $1 AND account_key = $2`,
      [platform, accountKey],
    );
    if (!row) return null;

    return {
      ...row,
      accessToken: readStoredToken(row.accessToken, platform, accountKey, "access_token"),
      refreshToken: readStoredToken(row.refreshToken, platform, accountKey, "refresh_token"),
    };
  } catch {
    return null;
  }
}

export interface SaveTikTokShopInput {
  shop: TikTokShop;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  grantedScopes: string[];
  sellerName: string | null;
  region: string | null;
}

async function upsertPlatformAccount({
  platform,
  shopId,
  shopCipher,
  shopName,
  sellerName,
  region,
  accessToken,
  refreshToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
  grantedScopes,
}: {
  platform: string;
  shopId: string;
  shopCipher: string | null;
  shopName: string;
  sellerName: string | null;
  region: string | null;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  grantedScopes: string[];
}): Promise<void> {
  await query(
    `INSERT INTO platform_accounts (
       platform, account_key, shop_id, shop_cipher, shop_name, seller_name, region,
       access_token, refresh_token, access_token_expires_at, refresh_token_expires_at,
       granted_scopes, status, last_error, connected_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],'connected',NULL,now(),now())
     ON CONFLICT (platform, account_key) DO UPDATE SET
       shop_id = EXCLUDED.shop_id,
       shop_cipher = EXCLUDED.shop_cipher,
       shop_name = EXCLUDED.shop_name,
       seller_name = EXCLUDED.seller_name,
       region = EXCLUDED.region,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       granted_scopes = EXCLUDED.granted_scopes,
       status = 'connected',
       last_error = NULL,
       connected_at = now(),
       updated_at = now()`,
    [
      platform,
      shopId,
      shopId,
      shopCipher,
      shopName,
      sellerName,
      region,
      // เก็บโทเคนแบบเข้ารหัสเสมอ — คีย์ถอดรหัสอยู่ใน env ไม่ได้อยู่ในฐานข้อมูล
      encryptSecret(accessToken),
      encryptSecret(refreshToken),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      grantedScopes,
    ],
  );
}

/** บันทึก/อัปเดตร้าน TikTok ที่เชื่อมแล้ว — หนึ่งร้านต่อหนึ่งแถว (platform + shop id) */
export async function saveTikTokShop(input: SaveTikTokShopInput): Promise<void> {
  await upsertPlatformAccount({
    platform: TIKTOK_PLATFORM,
    shopId: input.shop.id,
    shopCipher: input.shop.cipher,
    shopName: input.shop.name,
    sellerName: input.sellerName,
    region: input.region ?? input.shop.region,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    grantedScopes: input.grantedScopes,
  });
}

export interface SaveShopeeShopInput {
  shopId: string;
  shopName: string;
  region: string | null;
  env: ShopeeEnvironment;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/** บันทึก/อัปเดตร้าน Shopee (Sandbox / Live) */
export async function saveShopeeShop(input: SaveShopeeShopInput): Promise<void> {
  await upsertPlatformAccount({
    platform: SHOPEE_PLATFORM,
    shopId: input.shopId,
    shopCipher: input.env,
    shopName: input.shopName,
    sellerName: input.shopName,
    region: input.region,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    grantedScopes: [input.env],
  });
}

export async function updateAccountTokens({
  platform,
  accountKey,
  accessToken,
  refreshToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
}: {
  platform: string;
  accountKey: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}): Promise<void> {
  await query(
    `UPDATE platform_accounts
     SET access_token = $3, refresh_token = $4,
         access_token_expires_at = $5, refresh_token_expires_at = $6,
         status = 'connected', last_error = NULL, updated_at = now()
     WHERE platform = $1 AND account_key = $2`,
    [
      platform,
      accountKey,
      encryptSecret(accessToken),
      encryptSecret(refreshToken),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    ],
  );
}

export async function markAccountError(
  platform: string,
  accountKey: string,
  message: string,
): Promise<void> {
  await query(
    `UPDATE platform_accounts
     SET status = 'error', last_error = $3, updated_at = now()
     WHERE platform = $1 AND account_key = $2`,
    [platform, accountKey, message.slice(0, 500)],
  );
}
