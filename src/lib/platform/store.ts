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

const SETTINGS_KEY = "platform_api";
export const TIKTOK_PLATFORM = "TikTok";

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]/g, "").trim().slice(0, max)
    : "";
}

export interface StoredPlatformConfig {
  tiktok: TikTokAppConfig | null;
  updatedAt: string | null;
}

export async function getPlatformConfig(): Promise<StoredPlatformConfig> {
  try {
    const row = await queryOne<{ value_json: unknown; updated_at: string | null }>(
      "SELECT value_json, updated_at::text AS updated_at FROM app_settings WHERE setting_key = $1",
      [SETTINGS_KEY],
    );
    const raw = (row?.value_json ?? {}) as Record<string, unknown>;
    const tiktok = raw.tiktok as Record<string, unknown> | undefined;
    const appKey = clean(tiktok?.appKey, 200);
    const storedSecret = clean(tiktok?.appSecret, 4000);
    const serviceId = clean(tiktok?.serviceId, 200);

    let appSecret = "";
    if (storedSecret) {
      try {
        appSecret = decryptSecret(storedSecret);
      } catch {
        // คีย์ไม่ตรงหรือยังไม่ได้ตั้งคีย์ — ให้หน้าเว็บเห็นว่ายังใช้งานไม่ได้ ดีกว่าโยน error ทั้งหน้า
        appSecret = "";
      }

      // ค่าเก่าที่เคยเก็บเป็นข้อความธรรมดา → เข้ารหัสทับทันทีเมื่อมีคีย์
      if (
        appSecret &&
        !isEncryptedValue(storedSecret) &&
        isEncryptionConfigured()
      ) {
        try {
          await query(
            `UPDATE app_settings
             SET value_json = jsonb_set(value_json, '{tiktok,appSecret}', to_jsonb($2::text)),
                 updated_at = now()
             WHERE setting_key = $1`,
            [SETTINGS_KEY, encryptSecret(appSecret)],
          );
        } catch {
          // เข้ารหัสซ้ำไม่สำเร็จไม่ควรทำให้อ่านค่าไม่ได้
        }
      }
    }

    return {
      tiktok: appKey && appSecret && serviceId ? { appKey, appSecret, serviceId } : null,
      updatedAt: row?.updated_at ?? null,
    };
  } catch {
    // ฐานข้อมูลยังไม่พร้อม (ระหว่าง build) — ถือว่ายังไม่ตั้งค่า
    return { tiktok: null, updatedAt: null };
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

  const stored = await getPlatformConfig();
  const next = {
    ...(stored.tiktok ?? {}),
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
    [SETTINGS_KEY, JSON.stringify({ tiktok: next }), updatedBy],
  );

  return { appKey, appSecret, serviceId };
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

export async function getPlatformAccountRow(
  platform: string,
  accountKey: string,
): Promise<(PlatformAccountPublic & { accessToken: string | null; refreshToken: string | null }) | null> {
  try {
    return await queryOne<PlatformAccountPublic & { accessToken: string | null; refreshToken: string | null }>(
      `SELECT ${ACCOUNT_COLUMNS}, access_token AS "accessToken", refresh_token AS "refreshToken"
       FROM platform_accounts WHERE platform = $1 AND account_key = $2`,
      [platform, accountKey],
    );
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

/** บันทึก/อัปเดตร้านที่เชื่อมแล้ว — หนึ่งร้านต่อหนึ่งแถว (platform + shop id) */
export async function saveTikTokShop(input: SaveTikTokShopInput): Promise<void> {
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
      TIKTOK_PLATFORM,
      input.shop.id,
      input.shop.id,
      input.shop.cipher,
      input.shop.name,
      input.sellerName,
      input.region ?? input.shop.region,
      input.accessToken,
      input.refreshToken,
      input.accessTokenExpiresAt,
      input.refreshTokenExpiresAt,
      input.grantedScopes,
    ],
  );
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
      accessToken,
      refreshToken,
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
