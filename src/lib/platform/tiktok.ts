// ตัวเรียก TikTok Shop Open API — เฉพาะงานนำเข้าข้อมูลจากแพลตฟอร์ม (หน้า /platform)
//
// แยกจากระบบนำเข้าไฟล์เดิมโดยสิ้นเชิง: ไม่เขียนลง transactions / oms_orders / invoice_registry
// เอกสาร: https://partner.tiktokshop.com/docv2/page/authorization-overview-202407
//         https://partner.tiktokshop.com/docv2/page/sign-your-api-request
//
// การเซ็นชื่อ: sign = HMAC_SHA256(app_secret, app_secret + path + {key}{value} เรียงตาม key + body + app_secret)
// โดยตัด `sign` และ `access_token` ออก และส่ง access token ทาง header `x-tts-access-token`

import { createHmac, randomBytes } from "node:crypto";

export const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";
export const TIKTOK_AUTH_BASE = "https://auth.tiktok-shops.com";
export const TIKTOK_AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

/** คุกกี้เก็บ state ระหว่างเริ่ม authorize กับรับ callback (กันคำขอปลอม) */
export const TIKTOK_OAUTH_STATE_COOKIE = "tt_oauth_state";

export interface TikTokAppConfig {
  appKey: string;
  appSecret: string;
  serviceId: string;
}

export class TikTokApiError extends Error {
  readonly code: number | null;
  readonly requestId: string | null;

  constructor(message: string, code: number | null = null, requestId: string | null = null) {
    super(message);
    this.name = "TikTokApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

/** ค่าที่ต้องใช้กันการปลอมคำขอ (state) — สุ่มใหม่ทุกครั้งที่เริ่ม authorize */
export function createOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function buildAuthorizeUrl(config: TikTokAppConfig, state: string): string {
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("service_id", config.serviceId);
  url.searchParams.set("state", state);
  return url.toString();
}

export function signRequest({
  path,
  query,
  body,
  appSecret,
}: {
  path: string;
  query: Record<string, string>;
  body?: string;
  appSecret: string;
}): string {
  const keys = Object.keys(query)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort();

  let input = path;
  for (const key of keys) {
    input += key + query[key];
  }
  if (body) input += body;

  return createHmac("sha256", appSecret)
    .update(appSecret + input + appSecret)
    .digest("hex");
}

/**
 * ลบความลับออกจากข้อความ error ก่อนส่งต่อ บันทึก หรือใส่ใน URL
 * (fetch error ของ Node บางกรณีมี URL เต็มติดมา ซึ่งมี app_secret อยู่ใน query)
 */
export function redactSecret(message: string, secret: string): string {
  let out = message;
  if (secret) out = out.split(secret).join("[redacted]");
  out = out.replace(/app_secret=[^&\s"']+/gi, "app_secret=[redacted]");
  out = out.replace(/refresh_token=[^&\s"']+/gi, "refresh_token=[redacted]");
  out = out.replace(/auth_code=[^&\s"']+/gi, "auth_code=[redacted]");
  return out.slice(0, 400);
}

/** เรียก fetch และแปลง network error เป็นข้อความที่ไม่มีข้อมูลลับ */
async function safeFetch(url: URL, secret: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "เชื่อมต่อ TikTok ไม่สำเร็จ";
    throw new TikTokApiError(redactSecret(raw, secret));
  }
}

/**
 * กันยิงถี่เกินลิมิตของ TikTok (Dynamic QPS — แนะนำ 3–10 req/s สำหรับ read/sync)
 * ทุกคำขอจะต่อคิวกันในโปรเซสนี้ ไม่ยิงขนาน และเว้นระยะขั้นต่ำระหว่างคำขอ
 */
const MAX_RETRIES = 5;

let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();

// อ่านค่าจาก env ตอนเรียก เพื่อให้เทสต์ปรับได้โดยไม่ต้อง import ใหม่
function minIntervalMs(): number {
  const value = Number(process.env.TIKTOK_MIN_INTERVAL_MS ?? 350);
  return Number.isFinite(value) && value >= 0 ? value : 350;
}

async function throttle(): Promise<void> {
  const interval = minIntervalMs();
  const turn = queue.then(async () => {
    const wait = lastCallAt + interval - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
  });
  queue = turn.catch(() => undefined);
  await turn;
}

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  const baseMs = Number(process.env.TIKTOK_RETRY_BASE_MS ?? 1000);
  const retryAfter = Number(retryAfterHeader);
  const base =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : (Number.isFinite(baseMs) ? baseMs : 1000) * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.min(500, base));
  return Math.min(base + jitter, 60_000);
}

interface TikTokEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data?: T;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: TikTokEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as TikTokEnvelope<T>;
  } catch {
    throw new TikTokApiError(`TikTok ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`);
  }

  if (!response.ok || !payload || payload.code !== 0) {
    throw new TikTokApiError(
      payload?.message || `TikTok API error (HTTP ${response.status})`,
      payload?.code ?? null,
      payload?.request_id ?? null,
    );
  }
  return (payload.data ?? {}) as T;
}

async function readJson<T>(response: Response): Promise<TikTokEnvelope<T> | null> {
  try {
    return (await response.json()) as TikTokEnvelope<T>;
  } catch {
    return null;
  }
}

function unwrapEnvelope<T>(response: Response, payload: TikTokEnvelope<T> | null): T {
  if (!response.ok || !payload || payload.code !== 0) {
    throw new TikTokApiError(
      payload?.message || `TikTok API error (HTTP ${response.status})`,
      payload?.code ?? null,
      payload?.request_id ?? null,
    );
  }
  return (payload.data ?? {}) as T;
}

export async function callTikTokApi<T>({
  config,
  path,
  method = "GET",
  query = {},
  body,
  accessToken,
}: {
  config: TikTokAppConfig;
  path: string;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string>;
  body?: unknown;
  accessToken?: string;
}): Promise<T> {
  const rawBody =
    body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);

  const params: Record<string, string> = {
    app_key: config.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...query,
  };

  const sign = signRequest({
    path,
    query: params,
    body: rawBody,
    appSecret: config.appSecret,
  });

  const url = new URL(TIKTOK_API_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("sign", sign);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await throttle();

    const response = await safeFetch(url, config.appSecret, {
      method,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { "x-tts-access-token": accessToken } : {}),
      },
      ...(method === "GET" ? {} : { body: rawBody }),
    });

    // 429 = ถูกจำกัดอัตรา (ฝั่ง transport) — ถอยแล้วลองใหม่ ไม่นับเป็น error
    if (response.status === 429) {
      if (attempt === MAX_RETRIES - 1) {
        throw new TikTokApiError("ถูกจำกัดอัตราการเรียก (429) — ลองใหม่ภายหลัง", 429);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, response.headers.get("retry-after"))),
      );
      continue;
    }

    const payload = await readJson<T>(response);

    // 36009002 = TikTok แจ้งว่ายิงถี่เกิน — ถอยแล้วลองใหม่เช่นกัน
    if (payload?.code === 36009002 && attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, response.headers.get("retry-after"))),
      );
      continue;
    }

    return unwrapEnvelope<T>(response, payload);
  }

  throw new TikTokApiError("เรียก TikTok API ไม่สำเร็จหลังลองซ้ำครบจำนวน");
}

export interface TikTokTokenResult {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  grantedScopes: string[];
  sellerName: string | null;
  sellerBaseRegion: string | null;
}

interface RawTokenData {
  access_token?: string;
  access_token_expire_in?: number;
  refresh_token?: string;
  refresh_token_expire_in?: number;
  granted_scopes?: string[];
  seller_name?: string;
  seller_base_region?: string;
}

function toTokenResult(data: RawTokenData): TikTokTokenResult {
  const now = Date.now();
  if (!data.access_token || !data.refresh_token) {
    throw new TikTokApiError("TikTok ไม่ได้คืน access_token / refresh_token");
  }
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now + (data.access_token_expire_in ?? 0) * 1000),
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt: new Date(now + (data.refresh_token_expire_in ?? 0) * 1000),
    grantedScopes: Array.isArray(data.granted_scopes) ? data.granted_scopes : [],
    sellerName: data.seller_name ?? null,
    sellerBaseRegion: data.seller_base_region ?? null,
  };
}

/** แลก auth_code (อายุ 30 นาที ใช้ได้ครั้งเดียว) เป็น token */
export async function exchangeAuthCode(
  config: TikTokAppConfig,
  authCode: string,
): Promise<TikTokTokenResult> {
  const url = new URL(TIKTOK_AUTH_BASE + "/api/v2/token/get");
  url.searchParams.set("app_key", config.appKey);
  url.searchParams.set("app_secret", config.appSecret);
  url.searchParams.set("auth_code", authCode);
  // ค่าที่ TikTok กำหนดไว้จริงคือ authorized_code (ไม่ใช่ authorization_code)
  url.searchParams.set("grant_type", "authorized_code");

  await throttle();
  const response = await safeFetch(url, config.appSecret, { cache: "no-store" });
  const data = await readEnvelope<RawTokenData>(response);
  return toTokenResult(data);
}

export async function refreshAccessToken(
  config: TikTokAppConfig,
  refreshToken: string,
): Promise<TikTokTokenResult> {
  const url = new URL(TIKTOK_AUTH_BASE + "/api/v2/token/refresh");
  url.searchParams.set("app_key", config.appKey);
  url.searchParams.set("app_secret", config.appSecret);
  url.searchParams.set("refresh_token", refreshToken);
  url.searchParams.set("grant_type", "refresh_token");

  await throttle();
  const response = await safeFetch(url, config.appSecret, { cache: "no-store" });
  const data = await readEnvelope<RawTokenData>(response);
  return toTokenResult(data);
}

export interface TikTokShop {
  id: string;
  name: string;
  region: string | null;
  cipher: string;
  sellerType: string | null;
}

interface RawShopsData {
  shops?: Array<{
    id?: string;
    name?: string;
    region?: string;
    cipher?: string;
    seller_type?: string;
  }>;
}

/** ร้านที่ authorize แอปไว้ — ใช้เอา shop_cipher ซึ่งทุก API ระดับร้านต้องส่ง */
export async function getAuthorizedShops(
  config: TikTokAppConfig,
  accessToken: string,
): Promise<TikTokShop[]> {
  const data = await callTikTokApi<RawShopsData>({
    config,
    path: "/authorization/202309/shops",
    accessToken,
  });

  return (data.shops ?? [])
    .filter((shop): shop is { id: string; cipher: string } & typeof shop =>
      Boolean(shop.id && shop.cipher),
    )
    .map((shop) => ({
      id: shop.id,
      name: shop.name ?? shop.id,
      region: shop.region ?? null,
      cipher: shop.cipher,
      sellerType: shop.seller_type ?? null,
    }));
}

export interface TikTokPackage {
  id: string;
  status: string;
  createTime: number;
  updateTime: number;
  trackingNumber: string | null;
  shippingProvider: string | null;
  orderIds: string[];
}

interface RawPackagesData {
  packages?: Array<{
    id?: string;
    status?: string;
    create_time?: number;
    update_time?: number;
    tracking_number?: string;
    shipping_provider_name?: string;
    orders?: Array<{ id?: string }>;
  }>;
  total_count?: number;
  next_page_token?: string;
}

/** ค้นหาพัสดุตามช่วงเวลาที่สร้าง — ใช้ทำสรุปสถานะขนส่ง (ไม่ต้องใช้ Order Information) */
export async function searchPackages({
  config,
  accessToken,
  shopCipher,
  createTimeGe,
  createTimeLt,
  pageSize = 100,
  packageStatus,
}: {
  config: TikTokAppConfig;
  accessToken: string;
  shopCipher: string;
  createTimeGe: number;
  createTimeLt: number;
  pageSize?: number;
  packageStatus?: string;
}): Promise<{ packages: TikTokPackage[]; totalCount: number }> {
  const data = await callTikTokApi<RawPackagesData>({
    config,
    path: "/fulfillment/202309/packages/search",
    method: "POST",
    query: {
      shop_cipher: shopCipher,
      page_size: String(pageSize),
      sort_field: "create_time",
      sort_order: "DESC",
    },
    body: {
      create_time_ge: createTimeGe,
      create_time_lt: createTimeLt,
      ...(packageStatus ? { package_status: packageStatus } : {}),
    },
    accessToken,
  });

  return {
    packages: (data.packages ?? []).map((row) => ({
      id: row.id ?? "",
      status: row.status ?? "UNKNOWN",
      createTime: row.create_time ?? 0,
      updateTime: row.update_time ?? 0,
      trackingNumber: row.tracking_number ?? null,
      shippingProvider: row.shipping_provider_name ?? null,
      orderIds: (row.orders ?? []).map((order) => order.id ?? "").filter(Boolean),
    })),
    totalCount: data.total_count ?? 0,
  };
}

export interface TikTokStatement {
  id: string;
  statementTime: number;
  settlementAmount: string;
  currency: string;
  paymentStatus: string;
  adjustmentAmount: string;
  revenueAmount: string | null;
  feeAmount: string | null;
}

interface RawStatementsData {
  statements?: Array<{
    id?: string;
    statement_time?: number;
    settlement_amount?: string;
    currency?: string;
    payment_status?: string;
    adjustment_amount?: string;
    revenue_amount?: string;
    fee_amount?: string;
  }>;
  next_page_token?: string;
}

/** Statement รายวันของ TikTok — ใช้เป็นตัวทดสอบว่าเชื่อมต่อและสิทธิ์ Finance ใช้ได้จริง */
export async function listStatements({
  config,
  accessToken,
  shopCipher,
  fromUnix,
  toUnix,
  pageSize = 20,
}: {
  config: TikTokAppConfig;
  accessToken: string;
  shopCipher: string;
  fromUnix?: number;
  toUnix?: number;
  pageSize?: number;
}): Promise<{ statements: TikTokStatement[]; nextPageToken: string | null }> {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(pageSize),
    sort_field: "statement_time",
    sort_order: "DESC",
  };
  if (fromUnix) query.statement_time_ge = String(fromUnix);
  if (toUnix) query.statement_time_lt = String(toUnix);

  const data = await callTikTokApi<RawStatementsData>({
    config,
    path: "/finance/202309/statements",
    query,
    accessToken,
  });

  return {
    statements: (data.statements ?? []).map((row) => ({
      id: row.id ?? "",
      statementTime: row.statement_time ?? 0,
      settlementAmount: row.settlement_amount ?? "0",
      currency: row.currency ?? "THB",
      paymentStatus: row.payment_status ?? "UNKNOWN",
      adjustmentAmount: row.adjustment_amount ?? "0",
      revenueAmount: row.revenue_amount ?? null,
      feeAmount: row.fee_amount ?? null,
    })),
    nextPageToken: data.next_page_token ?? null,
  };
}
