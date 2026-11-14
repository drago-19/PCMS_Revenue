// ตัวเรียก Shopee Open Platform API v2 — แยกจากระบบนำเข้าไฟล์ Excel และแยกจาก TikTok โดยสิ้นเชิง
//
// การเซ็นชื่อตามสเปก Shopee Open Platform v2:
// - Public / Auth API: HMAC_SHA256(partner_key, partner_id + path + timestamp)
// - Shop API:          HMAC_SHA256(partner_key, partner_id + path + timestamp + access_token + shop_id)

import { createHmac, randomBytes } from "node:crypto";

export const SHOPEE_HOSTS = {
  sandbox: "https://openplatform.sandbox.test-stable.shopee.sg",
  live: "https://partner.shopeemobile.com",
} as const;

export type ShopeeEnvironment = keyof typeof SHOPEE_HOSTS;

/** คุกกี้เก็บ state ระหว่างเริ่ม authorize กับรับ callback (กัน CSRF) */
export const SHOPEE_OAUTH_STATE_COOKIE = "sp_oauth_state";

export interface ShopeeAppConfig {
  partnerId: string;
  partnerKey: string;
  env: ShopeeEnvironment;
  redirectBaseUrl?: string | null;
}

export class ShopeeApiError extends Error {
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(message: string, code: string | null = null, requestId: string | null = null) {
    super(message);
    this.name = "ShopeeApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

export function normalizeShopeeEnv(value: unknown): ShopeeEnvironment {
  return value === "live" ? "live" : "sandbox";
}

export function getShopeeBaseUrl(env: ShopeeEnvironment): string {
  return SHOPEE_HOSTS[env];
}

/** สุ่ม state กันการปลอมคำขอ OAuth */
export function createShopeeOAuthState(): string {
  return randomBytes(16).toString("hex");
}

/** ลายเซ็นสำหรับ Public / Auth endpoint: partner_id + path + timestamp */
export function signShopeePublicRequest({
  partnerId,
  path,
  timestamp,
  partnerKey,
}: {
  partnerId: string | number;
  path: string;
  timestamp: string | number;
  partnerKey: string;
}): string {
  const baseString = `${partnerId}${path}${timestamp}`;
  return createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

/** ลายเซ็นสำหรับ Shop endpoint: partner_id + path + timestamp + access_token + shop_id */
export function signShopeeShopRequest({
  partnerId,
  path,
  timestamp,
  accessToken,
  shopId,
  partnerKey,
}: {
  partnerId: string | number;
  path: string;
  timestamp: string | number;
  accessToken: string;
  shopId: string | number;
  partnerKey: string;
}): string {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

/** ลบข้อมูลลับออกจากข้อความ error ก่อนบันทึกหรือส่งต่อ */
export function redactShopeeSecret(message: string, secret: string): string {
  let out = message;
  if (secret) out = out.split(secret).join("[redacted]");
  out = out.replace(/partner_key=[^&\s"']+/gi, "partner_key=[redacted]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]");
  out = out.replace(/refresh_token=[^&\s"']+/gi, "refresh_token=[redacted]");
  out = out.replace(/sign=[0-9a-f]+/gi, "sign=[redacted]");
  out = out.replace(/code=[^&\s"']+/gi, "code=[redacted]");
  return out.slice(0, 400);
}

const CLOCK_SKEW_THRESHOLD_SEC = 5;
const MAX_RETRIES = 4;

let clockOffsetSeconds = 0;
let lastCallAt = 0;
let inFlight = 0;
const waiting: Array<() => void> = [];

/** เวลาปัจจุบัน (วินาที Unix) ที่ชดเชยส่วนต่างกับนาฬิกาของเซิร์ฟเวอร์ Shopee แล้ว */
export function shopeeNowSeconds(): number {
  return Math.floor(Date.now() / 1000) + clockOffsetSeconds;
}

/** รีเซ็ตค่าชดเชยนาฬิกา (ใช้ในเทสต์) */
export function resetShopeeClockOffset(): void {
  clockOffsetSeconds = 0;
}

function minIntervalMs(): number {
  const value = Number(process.env.SHOPEE_MIN_INTERVAL_MS ?? 200);
  return Number.isFinite(value) && value >= 0 ? value : 200;
}

function maxConcurrency(): number {
  const value = Number(process.env.SHOPEE_MAX_CONCURRENCY ?? 3);
  if (!Number.isFinite(value) || value < 1) return 3;
  return Math.min(8, Math.floor(value));
}

async function acquireSlot(): Promise<void> {
  if (inFlight >= maxConcurrency()) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight += 1;
  const wait = lastCallAt + minIntervalMs() - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiting.shift();
  if (next) next();
}

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  const baseMs = Number(process.env.SHOPEE_RETRY_BASE_MS ?? 1000);
  const retryAfter = Number(retryAfterHeader);
  const base =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : (Number.isFinite(baseMs) ? baseMs : 1000) * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.min(400, base));
  return Math.min(base + jitter, 30_000);
}

function syncClockOffsetFromResponse(response: Response): boolean {
  const dateHeader = response.headers.get("date");
  if (!dateHeader) return false;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return false;

  const rawOffset = Math.floor(serverMs / 1000) - Math.floor(Date.now() / 1000);
  const nextOffset = Math.abs(rawOffset) >= CLOCK_SKEW_THRESHOLD_SEC ? rawOffset : 0;
  const changed = Math.abs(nextOffset - clockOffsetSeconds) >= 2;
  clockOffsetSeconds = nextOffset;
  return changed;
}

interface ShopeeEnvelope<T> {
  error?: string;
  message?: string;
  request_id?: string;
  response?: T;
  // token endpoints return fields directly at top level without `response` wrapper
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  shop_id?: number;
  merchant_id?: number;
}

function isTimestampError(payload: ShopeeEnvelope<unknown> | null): boolean {
  const text = `${payload?.error ?? ""} ${payload?.message ?? ""}`;
  return /\btimestamp\b/i.test(text);
}

function isRateLimitPayload(payload: ShopeeEnvelope<unknown> | null): boolean {
  const err = (payload?.error ?? "").toLowerCase();
  return err.includes("rate_limit") || err.includes("too_many_requests");
}

async function safeFetch(url: URL, secret: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "เชื่อมต่อ Shopee ไม่สำเร็จ";
    throw new ShopeeApiError(redactShopeeSecret(raw, secret));
  }
}

async function readJson<T>(response: Response): Promise<ShopeeEnvelope<T> | null> {
  try {
    return (await response.json()) as ShopeeEnvelope<T>;
  } catch {
    return null;
  }
}

export async function callShopeeApi<T>({
  config,
  path,
  method = "GET",
  query = {},
  body,
  accessToken,
  shopId,
}: {
  config: ShopeeAppConfig;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  accessToken?: string;
  shopId?: string;
}): Promise<ShopeeEnvelope<T>> {
  const rawBody = body === undefined ? undefined : JSON.stringify(body);
  let retriedClockSkew = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await acquireSlot();

    const timestamp = String(shopeeNowSeconds());
    const sign =
      accessToken && shopId
        ? signShopeeShopRequest({
            partnerId: config.partnerId,
            path,
            timestamp,
            accessToken,
            shopId,
            partnerKey: config.partnerKey,
          })
        : signShopeePublicRequest({
            partnerId: config.partnerId,
            path,
            timestamp,
            partnerKey: config.partnerKey,
          });

    const url = new URL(getShopeeBaseUrl(config.env) + path);
    url.searchParams.set("partner_id", config.partnerId);
    url.searchParams.set("timestamp", timestamp);
    url.searchParams.set("sign", sign);
    if (accessToken) url.searchParams.set("access_token", accessToken);
    if (shopId) url.searchParams.set("shop_id", shopId);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await safeFetch(url, config.partnerKey, {
      method,
      cache: "no-store",
      headers: { "content-type": "application/json" },
      ...(method === "POST" && rawBody ? { body: rawBody } : {}),
    }).finally(() => releaseSlot());

    const clockAdjusted = syncClockOffsetFromResponse(response);

    if (response.status === 429) {
      if (attempt === MAX_RETRIES - 1) {
        throw new ShopeeApiError("ถูกจำกัดอัตราการเรียก Shopee (429) — ลองใหม่ภายหลัง", "429");
      }
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, response.headers.get("retry-after"))),
      );
      continue;
    }

    const payload = await readJson<T>(response);

    if (isTimestampError(payload) && clockAdjusted && !retriedClockSkew && attempt < MAX_RETRIES - 1) {
      retriedClockSkew = true;
      continue;
    }

    if (isRateLimitPayload(payload) && attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, response.headers.get("retry-after"))),
      );
      continue;
    }

    if (!response.ok || !payload || (payload.error && payload.error !== "")) {
      const msg =
        payload?.message ||
        payload?.error ||
        `Shopee API error (HTTP ${response.status})`;
      throw new ShopeeApiError(
        redactShopeeSecret(msg, config.partnerKey),
        payload?.error ?? String(response.status),
        payload?.request_id ?? null,
      );
    }

    return payload;
  }

  throw new ShopeeApiError("เรียก Shopee API ไม่สำเร็จหลังลองซ้ำครบจำนวน");
}

/** สร้างลิงก์ authorize ของ Shopee (/api/v2/shop/auth_partner) */
export function buildShopeeAuthorizeUrl(config: ShopeeAppConfig, redirectUri: string): string {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = String(shopeeNowSeconds());
  const sign = signShopeePublicRequest({
    partnerId: config.partnerId,
    path,
    timestamp,
    partnerKey: config.partnerKey,
  });

  const url = new URL(getShopeeBaseUrl(config.env) + path);
  url.searchParams.set("partner_id", config.partnerId);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  url.searchParams.set("redirect", redirectUri);
  return url.toString();
}

export interface ShopeeTokenResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  /** refresh token ของ Shopee มีอายุ ~30 วัน (ต่ออายุทุกครั้งที่ refresh) */
  refreshTokenExpiresAt: Date;
  shopId: string;
}

const SHOPEE_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function toTokenResult(
  payload: ShopeeEnvelope<unknown>,
  fallbackShopId: string,
): ShopeeTokenResult {
  const now = Date.now();
  if (!payload.access_token || !payload.refresh_token) {
    throw new ShopeeApiError("Shopee ไม่ได้คืน access_token / refresh_token");
  }
  const expireIn = Number(payload.expire_in ?? 14_400);
  const shopId = payload.shop_id ? String(payload.shop_id) : fallbackShopId;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessTokenExpiresAt: new Date(now + expireIn * 1000),
    refreshTokenExpiresAt: new Date(now + SHOPEE_REFRESH_TTL_MS),
    shopId,
  };
}

/** แลก authorization code เป็น access_token + refresh_token */
export async function exchangeShopeeAuthCode(
  config: ShopeeAppConfig,
  { code, shopId }: { code: string; shopId: string },
): Promise<ShopeeTokenResult> {
  const numericPartnerId = Number(config.partnerId);
  const numericShopId = Number(shopId);
  if (!Number.isSafeInteger(numericPartnerId) || !Number.isSafeInteger(numericShopId)) {
    throw new ShopeeApiError("Partner ID หรือ Shop ID ต้องเป็นตัวเลข");
  }

  const payload = await callShopeeApi<unknown>({
    config,
    path: "/api/v2/auth/token/get",
    method: "POST",
    body: {
      code,
      partner_id: numericPartnerId,
      shop_id: numericShopId,
    },
  });

  return toTokenResult(payload, shopId);
}

/** ขอ access_token ใหม่จาก refresh_token (Shopee access_token อายุ 4 ชม. และหมุน refresh_token ทุกครั้ง) */
export async function refreshShopeeAccessToken(
  config: ShopeeAppConfig,
  { refreshToken, shopId }: { refreshToken: string; shopId: string },
): Promise<ShopeeTokenResult> {
  const numericPartnerId = Number(config.partnerId);
  const numericShopId = Number(shopId);
  if (!Number.isSafeInteger(numericPartnerId) || !Number.isSafeInteger(numericShopId)) {
    throw new ShopeeApiError("Partner ID หรือ Shop ID ต้องเป็นตัวเลข");
  }

  const payload = await callShopeeApi<unknown>({
    config,
    path: "/api/v2/auth/access_token/get",
    method: "POST",
    body: {
      refresh_token: refreshToken,
      partner_id: numericPartnerId,
      shop_id: numericShopId,
    },
  });

  return toTokenResult(payload, shopId);
}

/** แปลงข้อความจาก callback URL หรือค่าตรง (สำหรับวางลิงก์ callback ตอนทดสอบ Sandbox) */
export function parseShopeeCallbackInput(input: {
  callbackUrl?: string;
  code?: string;
  shopId?: string;
}): { code: string; shopId: string } {
  const rawUrl = input.callbackUrl?.trim();
  if (rawUrl) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new ShopeeApiError("รูปแบบ Callback URL ไม่ถูกต้อง");
    }
    const code = parsed.searchParams.get("code")?.trim() ?? "";
    const shopId = parsed.searchParams.get("shop_id")?.trim() ?? "";
    if (!code || !/^\d+$/.test(shopId)) {
      throw new ShopeeApiError("ไม่พบ code หรือ shop_id ใน Callback URL");
    }
    return { code, shopId };
  }

  const code = input.code?.trim() ?? "";
  const shopId = input.shopId?.trim() ?? "";
  if (!code || !/^\d+$/.test(shopId)) {
    throw new ShopeeApiError("กรุณากรอก code และ shop_id (ตัวเลข) ให้ครบ");
  }
  return { code, shopId };
}

export interface ShopeeShopInfo {
  shopId: string;
  shopName: string;
  region: string | null;
  status: string | null;
}

interface RawShopInfoResponse {
  shop_name?: string;
  region?: string;
  status?: string;
}

export async function getShopeeShopInfo(
  config: ShopeeAppConfig,
  { accessToken, shopId }: { accessToken: string; shopId: string },
): Promise<ShopeeShopInfo> {
  // v2.shop.get_shop_info คืนค่าที่ root (หรือ response แล้วแต่รุ่น) — รองรับทั้งคู่
  const payload = await callShopeeApi<RawShopInfoResponse>({
    config,
    path: "/api/v2/shop/get_shop_info",
    accessToken,
    shopId,
  });
  const body = (payload.response ?? payload) as RawShopInfoResponse;
  return {
    shopId,
    shopName: body.shop_name?.trim() || `Shopee #${shopId}`,
    region: body.region ?? null,
    status: body.status ?? null,
  };
}

/** แปลงสถานะออเดอร์ Shopee ให้ตรงกับป้าย/ตัวกรองของ PCMS platform */
export function normalizeShopeeOrderStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "READY_TO_SHIP":
    case "PROCESSED":
      return "AWAITING_SHIPMENT";
    case "RETRY_SHIP":
      return "AWAITING_COLLECTION";
    case "SHIPPED":
      return "IN_TRANSIT";
    case "TO_CONFIRM_RECEIVE":
      return "DELIVERED";
    case "IN_CANCEL":
      return "ON_HOLD";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "UNPAID":
      return "UNPAID";
    default:
      return (status ?? "UNKNOWN").toUpperCase();
  }
}

const MAX_ORDER_WINDOW_SEC = 15 * 24 * 60 * 60;

/** ดึงรายการ order_sn ตามช่วงเวลา (แบ่งช่วงละไม่เกิน 15 วันตามข้อจำกัด Shopee) */
export async function listShopeeOrderSns(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    timeRangeField = "update_time",
    timeFrom,
    timeTo,
    pageSize = 100,
  }: {
    accessToken: string;
    shopId: string;
    timeRangeField?: "create_time" | "update_time";
    timeFrom: number;
    timeTo: number;
    pageSize?: number;
  },
): Promise<string[]> {
  const seen = new Set<string>();
  const size = Math.min(Math.max(pageSize, 1), 100);

  for (let start = timeFrom; start < timeTo; start += MAX_ORDER_WINDOW_SEC) {
    const end = Math.min(timeTo, start + MAX_ORDER_WINDOW_SEC);
    let cursor = "";

    for (let page = 0; page < 50; page += 1) {
      const payload = await callShopeeApi<{
        more?: boolean;
        next_cursor?: string;
        order_list?: Array<{ order_sn?: string }>;
      }>({
        config,
        path: "/api/v2/order/get_order_list",
        accessToken,
        shopId,
        query: {
          time_range_field: timeRangeField,
          time_from: String(start),
          time_to: String(end),
          page_size: String(size),
          ...(cursor ? { cursor } : {}),
        },
      });

      const res = payload.response ?? {};
      for (const item of res.order_list ?? []) {
        if (item.order_sn) seen.add(item.order_sn);
      }

      if (!res.more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
  }

  return [...seen];
}

export interface ShopeeOrderItem {
  lineItemId: string;
  skuId: string | null;
  productName: string | null;
  skuName: string | null;
  imageUrl: string | null;
  quantity: number;
  salePrice: string | null;
  currency: string | null;
}

export interface ShopeeOrder {
  id: string;
  status: string;
  rawStatus: string;
  createTime: number;
  paidTime: number | null;
  shippedTime: number | null;
  cancelledTime: number | null;
  cancelReason: string | null;
  cancelUser: string | null;
  currency: string | null;
  totalAmount: string | null;
  trackingNumber: string | null;
  shippingProvider: string | null;
  buyerUserId: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  province: string | null;
  district: string | null;
  postalCode: string | null;
  items: ShopeeOrderItem[];
  raw: unknown;
}

const ORDER_OPTIONAL_FIELDS = [
  "buyer_user_id",
  "buyer_username",
  "recipient_address",
  "item_list",
  "pay_time",
  "shipping_carrier",
  "total_amount",
  "payment_method",
  "package_list",
  "cancel_reason",
  "cancel_by",
].join(",");

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getShopeeOrderDetails(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    orderSns,
  }: { accessToken: string; shopId: string; orderSns: string[] },
): Promise<ShopeeOrder[]> {
  if (orderSns.length === 0) return [];
  const orders: ShopeeOrder[] = [];

  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    const payload = await callShopeeApi<{
      order_list?: Array<Record<string, unknown>>;
    }>({
      config,
      path: "/api/v2/order/get_order_detail",
      accessToken,
      shopId,
      query: {
        order_sn_list: batch.join(","),
        response_optional_fields: ORDER_OPTIONAL_FIELDS,
      },
    });

    for (const raw of payload.response?.order_list ?? []) {
      const orderSn = String(raw.order_sn ?? "");
      if (!orderSn) continue;
      const rawStatus = String(raw.order_status ?? "");
      const addr = (raw.recipient_address ?? {}) as Record<string, unknown>;
      const packages = Array.isArray(raw.package_list)
        ? (raw.package_list as Array<Record<string, unknown>>)
        : [];
      const firstPkg = packages[0] ?? {};
      const itemList = Array.isArray(raw.item_list)
        ? (raw.item_list as Array<Record<string, unknown>>)
        : [];

      const items: ShopeeOrderItem[] = itemList.map((item, idx) => {
        const itemId = String(item.item_id ?? "");
        const modelId = String(item.model_id ?? "0");
        const skuId =
          item.model_sku && String(item.model_sku).trim()
            ? String(item.model_sku).trim()
            : item.item_sku && String(item.item_sku).trim()
              ? String(item.item_sku).trim()
              : `${itemId}:${modelId}`;
        const img = (item.image_info as { image_url?: string } | undefined)?.image_url ?? null;
        return {
          lineItemId: `${orderSn}:${itemId}:${modelId}:${idx}`,
          skuId,
          productName: item.item_name ? String(item.item_name) : null,
          skuName: item.model_name ? String(item.model_name) : null,
          imageUrl: img,
          quantity: Number(item.model_quantity_purchased ?? 0),
          salePrice:
            item.model_discounted_price !== undefined
              ? String(item.model_discounted_price)
              : item.model_original_price !== undefined
                ? String(item.model_original_price)
                : null,
          currency: raw.currency ? String(raw.currency) : "THB",
        };
      });

      const statusUpper = rawStatus.toUpperCase();
      const createTime = Number(raw.create_time ?? 0);
      const updateTime = numOrNull(raw.update_time);
      const shippedTime =
        statusUpper === "SHIPPED" || statusUpper === "TO_CONFIRM_RECEIVE" || statusUpper === "COMPLETED"
          ? updateTime
          : null;
      const cancelledTime = statusUpper === "CANCELLED" ? updateTime : null;

      orders.push({
        id: orderSn,
        status: normalizeShopeeOrderStatus(rawStatus),
        rawStatus,
        createTime,
        paidTime: numOrNull(raw.pay_time),
        shippedTime,
        cancelledTime,
        cancelReason: raw.cancel_reason ? String(raw.cancel_reason) : null,
        cancelUser: raw.cancel_by ? String(raw.cancel_by).toUpperCase() : null,
        currency: raw.currency ? String(raw.currency) : "THB",
        totalAmount: raw.total_amount !== undefined ? String(raw.total_amount) : null,
        trackingNumber: firstPkg.tracking_number ? String(firstPkg.tracking_number) : null,
        shippingProvider:
          firstPkg.shipping_carrier
            ? String(firstPkg.shipping_carrier)
            : raw.shipping_carrier
              ? String(raw.shipping_carrier)
              : null,
        buyerUserId: raw.buyer_user_id ? String(raw.buyer_user_id) : null,
        recipientName:
          (addr.name ? String(addr.name) : null) ??
          (raw.buyer_username ? String(raw.buyer_username) : null),
        recipientPhone: addr.phone ? String(addr.phone) : null,
        province: addr.state ? String(addr.state) : null,
        district: addr.district ? String(addr.district) : addr.city ? String(addr.city) : null,
        postalCode: addr.zipcode ? String(addr.zipcode) : null,
        items,
        raw,
      });
    }
  }

  return orders;
}

export interface ShopeeEscrowDetail {
  orderSn: string;
  settlementAmount: number;
  revenueAmount: number;
  feeAndTaxAmount: number;
  shippingCostAmount: number;
  currency: string;
  raw: unknown;
}

/** ดึงรายละเอียดรายได้/ค่าธรรมเนียมรายออเดอร์ (v2.payment.get_escrow_detail) */
export async function getShopeeEscrowDetail(
  config: ShopeeAppConfig,
  { accessToken, shopId, orderSn }: { accessToken: string; shopId: string; orderSn: string },
): Promise<ShopeeEscrowDetail | null> {
  const payload = await callShopeeApi<{
    order_sn?: string;
    order_income?: Record<string, unknown>;
  }>({
    config,
    path: "/api/v2/payment/get_escrow_detail",
    accessToken,
    shopId,
    query: { order_sn: orderSn },
  });

  const income = payload.response?.order_income;
  if (!income) return null;

  const num = (key: string) => {
    const val = Number(income[key] ?? 0);
    return Number.isFinite(val) ? val : 0;
  };

  // escrow_amount = ยอดเงินโอนสุทธิที่ร้านได้รับจริงจาก Shopee ตามไฟล์/API
  const settlementAmount = num("escrow_amount");
  const revenueAmount =
    num("order_discounted_price") ||
    num("original_cost_of_goods_sold") ||
    num("buyer_total_amount");
  const commissionFee = num("commission_fee");
  const serviceFee = num("service_fee");
  const transactionFee = num("seller_transaction_fee");
  const shippingCost = num("actual_shipping_fee") + num("reverse_shipping_fee");
  // เก็บเป็นค่าลบเมื่อถูกหัก เพื่อความสม่ำเสมอกับตาราง platform_order_finance
  const rawFees = commissionFee + serviceFee + transactionFee;
  const feeAndTaxAmount = rawFees > 0 ? -rawFees : rawFees;

  return {
    orderSn: payload.response?.order_sn ?? orderSn,
    settlementAmount,
    revenueAmount,
    feeAndTaxAmount,
    shippingCostAmount: shippingCost > 0 ? -shippingCost : shippingCost,
    currency: typeof income.currency === "string" ? income.currency : "THB",
    raw: payload.response,
  };
}

export interface ShopeeInventoryItem {
  skuId: string;
  productId: string;
  sellerSku: string | null;
  productName: string | null;
  imageUrl: string | null;
  quantity: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
}

function sumShopeeStock(stockInfoV2: unknown): {
  quantity: number;
  warehouses: Array<{ warehouseId: string; quantity: number }>;
} {
  const info = (stockInfoV2 ?? {}) as {
    summary_info?: { total_available_stock?: number };
    seller_stock?: Array<{ location_id?: string; stock?: number }>;
  };
  const warehouses = (info.seller_stock ?? []).map((s) => ({
    warehouseId: String(s.location_id ?? "default"),
    quantity: Number(s.stock ?? 0),
  }));
  const quantity =
    warehouses.length > 0
      ? warehouses.reduce((sum, w) => sum + w.quantity, 0)
      : Number(info.summary_info?.total_available_stock ?? 0);
  return { quantity, warehouses };
}

/** ดึงสินค้าและจำนวนสต็อกปัจจุบันจาก Shopee Sandbox/Live */
export async function listShopeeInventory(
  config: ShopeeAppConfig,
  { accessToken, shopId }: { accessToken: string; shopId: string },
): Promise<ShopeeInventoryItem[]> {
  const itemIds: number[] = [];
  let offset = 0;

  for (let page = 0; page < 30; page += 1) {
    const payload = await callShopeeApi<{
      item?: Array<{ item_id?: number }>;
      has_next_page?: boolean;
      next_offset?: number;
    }>({
      config,
      path: "/api/v2/product/get_item_list",
      accessToken,
      shopId,
      query: {
        offset: String(offset),
        page_size: "100",
        item_status: "NORMAL",
      },
    });
    const res = payload.response ?? {};
    for (const item of res.item ?? []) {
      if (typeof item.item_id === "number") itemIds.push(item.item_id);
    }
    if (!res.has_next_page || typeof res.next_offset !== "number") break;
    offset = res.next_offset;
  }

  if (itemIds.length === 0) return [];

  const collected: ShopeeInventoryItem[] = [];

  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    const basePayload = await callShopeeApi<{
      item_list?: Array<{
        item_id?: number;
        item_name?: string;
        item_sku?: string;
        has_model?: boolean;
        image?: { image_url_list?: string[] };
        stock_info_v2?: unknown;
      }>;
    }>({
      config,
      path: "/api/v2/product/get_item_base_info",
      accessToken,
      shopId,
      query: { item_id_list: batch.join(",") },
    });

    for (const item of basePayload.response?.item_list ?? []) {
      if (!item.item_id) continue;
      const productId = String(item.item_id);
      const imageUrl = item.image?.image_url_list?.[0] ?? null;
      const productName = item.item_name ?? null;

      if (item.has_model) {
        const modelPayload = await callShopeeApi<{
          model?: Array<{
            model_id?: number;
            model_sku?: string;
            model_name?: string;
            stock_info_v2?: unknown;
          }>;
        }>({
          config,
          path: "/api/v2/product/get_model_list",
          accessToken,
          shopId,
          query: { item_id: productId },
        });

        for (const model of modelPayload.response?.model ?? []) {
          if (model.model_id === undefined) continue;
          const stock = sumShopeeStock(model.stock_info_v2);
          collected.push({
            skuId: `${productId}:${model.model_id}`,
            productId,
            sellerSku: model.model_sku?.trim() || item.item_sku?.trim() || null,
            productName: model.model_name ? `${productName ?? ""} (${model.model_name})`.trim() : productName,
            imageUrl,
            quantity: stock.quantity,
            warehouses: stock.warehouses,
          });
        }
      } else {
        const stock = sumShopeeStock(item.stock_info_v2);
        collected.push({
          skuId: `${productId}:0`,
          productId,
          sellerSku: item.item_sku?.trim() || null,
          productName,
          imageUrl,
          quantity: stock.quantity,
          warehouses: stock.warehouses,
        });
      }
    }
  }

  return collected;
}

/** อัปเดตจำนวนสต็อกบน Shopee (เตรียมไว้สำหรับฟีเจอร์แก้สต็อกในอนาคต) */
export async function updateShopeeStock(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
    stockList,
  }: {
    accessToken: string;
    shopId: string;
    itemId: number;
    stockList: Array<{ model_id?: number; seller_stock: Array<{ location_id?: string; stock: number }> }>;
  },
): Promise<{ successList: unknown[]; failureList: unknown[] }> {
  const payload = await callShopeeApi<{
    success_list?: unknown[];
    failure_list?: unknown[];
  }>({
    config,
    path: "/api/v2/product/update_stock",
    method: "POST",
    accessToken,
    shopId,
    body: {
      item_id: itemId,
      stock_list: stockList,
    },
  });

  return {
    successList: payload.response?.success_list ?? [],
    failureList: payload.response?.failure_list ?? [],
  };
}

/** ตั้งจำนวนสต็อกของสินค้าเดียว (ไม่มีตัวเลือก) ให้เป็นค่านั้นตรง ๆ */
export async function setShopeeStock(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
    quantity,
    modelId,
  }: {
    accessToken: string;
    shopId: string;
    itemId: number;
    quantity: number;
    modelId?: number;
  },
): Promise<{ successList: unknown[]; failureList: unknown[] }> {
  const row: { model_id?: number; seller_stock: Array<{ stock: number }> } = {
    seller_stock: [{ stock: quantity }],
  };
  if (modelId !== undefined && modelId > 0) row.model_id = modelId;
  return updateShopeeStock(config, {
    accessToken,
    shopId,
    itemId,
    stockList: [row],
  });
}

/** ซ่อนสินค้าจากหน้าร้าน (ยังไม่ลบ กู้คืนได้ด้วยการนำขึ้นขายใหม่) */
export async function unlistShopeeItem(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
  }: { accessToken: string; shopId: string; itemId: number },
): Promise<{ successList: unknown[]; failureList: unknown[] }> {
  const payload = await callShopeeApi<{
    success_list?: unknown[];
    failure_list?: unknown[];
  }>({
    config,
    path: "/api/v2/product/unlist_item",
    method: "POST",
    accessToken,
    shopId,
    body: { item_list: [{ item_id: itemId, unlist: true }] },
  });

  return {
    successList: payload.response?.success_list ?? [],
    failureList: payload.response?.failure_list ?? [],
  };
}

export interface ShopeeCategory {
  categoryId: number;
  parentId: number;
  name: string;
  hasChildren: boolean;
}

/** รายการหมวดหมู่สินค้าทั้งหมดของ Shopee (ใช้เลือกหมวดตอนสร้างสินค้า) */
export async function listShopeeCategories(
  config: ShopeeAppConfig,
  { accessToken, shopId }: { accessToken: string; shopId: string },
): Promise<ShopeeCategory[]> {
  const payload = await callShopeeApi<{
    category_list?: Array<{
      category_id?: number;
      parent_category_id?: number;
      category_name?: string;
      has_children?: boolean;
    }>;
  }>({
    config,
    path: "/api/v2/product/get_category",
    query: { language: "th" },
    accessToken,
    shopId,
  });

  return (payload.response?.category_list ?? [])
    .filter((row) => typeof row?.category_id === "number")
    .map((row) => ({
      categoryId: Number(row.category_id),
      parentId: row.parent_category_id ?? 0,
      name: row.category_name ?? String(row.category_id),
      hasChildren: Boolean(row.has_children),
    }));
}

/**
 * เลือกหมวดใบสุดท้าย (has_children = false) ตามคำค้น
 * ถ้าไม่พบคำที่ตรง จะคืนใบแรกที่เจอ เพื่อให้สร้างสินค้าทดสอบได้
 */
export async function resolveShopeeLeafCategory(
  config: ShopeeAppConfig,
  keyword: string,
  scope: { accessToken: string; shopId: string },
): Promise<ShopeeCategory | null> {
  const categories = await listShopeeCategories(config, scope);
  const leaves = categories.filter((row) => !row.hasChildren);
  const needle = keyword.trim().toLowerCase();
  if (needle) {
    const exact = leaves.find((row) => row.name.toLowerCase().includes(needle));
    if (exact) return exact;
  }
  return leaves[0] ?? null;
}

/** ช่องทางขนส่งที่ร้านเปิดใช้ — ต้องส่งไปตอนสร้างสินค้า */
export async function listShopeeLogistics(
  config: ShopeeAppConfig,
  { accessToken, shopId }: { accessToken: string; shopId: string },
): Promise<Array<{ channelId: number; name: string }>> {
  const payload = await callShopeeApi<{
    logistics_channel_list?: Array<{
      logistics_channel_id?: number;
      logistics_channel_name?: string;
      enabled?: boolean;
    }>;
  }>({
    config,
    path: "/api/v2/logistics/get_channel_list",
    accessToken,
    shopId,
  });

  return (payload.response?.logistics_channel_list ?? [])
    .filter((row) => typeof row?.logistics_channel_id === "number")
    .map((row) => ({
      channelId: Number(row.logistics_channel_id),
      name: row.logistics_channel_name ?? String(row.logistics_channel_id),
    }));
}

/** อัปโหลดรูปเข้าคลังมีเดียของ Shopee แล้วคืน image_id สำหรับใช้สร้างสินค้า */
export async function uploadShopeeImage(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    data,
    fileName,
  }: { accessToken: string; shopId: string; data: Uint8Array; fileName: string },
): Promise<{ imageId: string; imageUrl: string | null }> {
  const path = "/api/v2/media_space/upload_image";
  const timestamp = String(shopeeNowSeconds());
  const sign = signShopeeShopRequest({
    partnerId: config.partnerId,
    path,
    timestamp,
    accessToken,
    shopId,
    partnerKey: config.partnerKey,
  });

  const url = new URL(getShopeeBaseUrl(config.env) + path);
  url.searchParams.set("partner_id", config.partnerId);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", shopId);

  const form = new FormData();
  const safeName = fileName.trim() || "product.jpg";
  form.append("image", new Blob([new Uint8Array(data)], { type: "image/jpeg" }), safeName);

  await acquireSlot();
  const response = await safeFetch(url, config.partnerKey, {
    method: "POST",
    cache: "no-store",
    body: form,
  }).finally(() => releaseSlot());

  const payload = await readJson<{
    image_info?: { image_id?: string; image_url?: string };
  }>(response);

  if (!response.ok || !payload || (payload.error && payload.error !== "") || !payload.response?.image_info?.image_id) {
    const msg = payload?.message || payload?.error || `อัปโหลดรูปไม่สำเร็จ (HTTP ${response.status})`;
    throw new ShopeeApiError(redactShopeeSecret(msg, config.partnerKey), payload?.error ?? null, payload?.request_id ?? null);
  }

  return {
    imageId: String(payload.response.image_info.image_id),
    imageUrl: payload.response.image_info.image_url ?? null,
  };
}

/** สร้างสินค้าใหม่บน Shopee — คืน item_id ที่สร้างได้ */
export async function addShopeeItem(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemName,
    description,
    price,
    stock,
    weightKg,
    categoryId,
    imageId,
    logisticIds,
    sellerSku,
    brandName,
    tierVariation,
    models,
  }: {
    accessToken: string;
    shopId: string;
    itemName: string;
    description: string;
    price: number;
    stock: number;
    weightKg: number;
    categoryId: number;
    imageId: string;
    logisticIds: number[];
    sellerSku?: string;
    brandName?: string;
    tierVariation?: Array<{ name: string; options: string[] }>;
    models?: Array<{ optionIndexes: number[]; price: number; stock: number; sku?: string }>;
  },
): Promise<{ itemId: number }> {
  const payload = await callShopeeApi<{ item_id?: number }>({
    config,
    path: "/api/v2/product/add_item",
    method: "POST",
    accessToken,
    shopId,
    body: {
      original_price: price,
      description: description || itemName,
      item_name: itemName,
      item_status: "NORMAL",
      weight: weightKg,
      dimension: { package_length: 10, package_width: 10, package_height: 10 },
      logistic_info: logisticIds.map((id) => ({ logistic_id: id, enabled: true })),
      category_id: categoryId,
      image: { image_id_list: [imageId] },
      seller_stock: [{ stock }],
      // Shopee บังคับให้ระบุแบรนด์ — ใช้ brand_id 0 พร้อมชื่อที่ผู้ใช้กรอก
      brand: { brand_id: 0, original_brand_name: brandName?.trim() || "No Brand" },
      ...(sellerSku ? { item_sku: sellerSku } : {}),
    },
  });

  const itemId = payload.response?.item_id;
  if (typeof itemId !== "number") {
    throw new ShopeeApiError("Shopee ไม่ได้คืน item_id หลังสร้างสินค้า");
  }

  // สินค้าหลายตัวเลือกต้องสร้างตัวเลือกหลังสร้างสินค้า: init_tier_variation แล้ว add_model
  if (tierVariation && tierVariation.length > 0 && models && models.length > 0) {
    await callShopeeApi<unknown>({
      config,
      path: "/api/v2/product/init_tier_variation",
      method: "POST",
      accessToken,
      shopId,
      body: {
        item_id: itemId,
        tier_variation: tierVariation.map((tier) => ({
          name: tier.name.trim().slice(0, 14),
          option_list: tier.options.map((option) => ({ option: option.trim().slice(0, 20) })),
        })),
        // Shopee ต้องการรายการตัวเลือก (model) มาพร้อมกันในคำขอนี้
        model: models.map((model) => ({
          tier_index: model.optionIndexes,
          original_price: model.price,
          seller_stock: [{ stock: model.stock }],
          ...(model.sku ? { model_sku: model.sku } : {}),
        })),
      },
    });
  }

  return { itemId };
}

/** แก้ราคาสินค้า (ทั้งสินค้าเดี่ยวและรายตัวเลือก) */
export async function updateShopeePrice(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
    price,
    modelId = 0,
  }: { accessToken: string; shopId: string; itemId: number; price: number; modelId?: number },
): Promise<{ failureList: unknown[] }> {
  const payload = await callShopeeApi<{ failure_list?: unknown[] }>({
    config,
    path: "/api/v2/product/update_price",
    method: "POST",
    accessToken,
    shopId,
    body: {
      item_id: itemId,
      price_list: [{ model_id: modelId, original_price: price }],
    },
  });

  return { failureList: payload.response?.failure_list ?? [] };
}

/** แก้ชื่อ/คำอธิบาย/รูปของสินค้า — ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน */
export async function updateShopeeItem(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
    itemName,
    description,
    imageId,
  }: {
    accessToken: string;
    shopId: string;
    itemId: number;
    itemName?: string;
    description?: string;
    imageId?: string;
  },
): Promise<void> {
  const body: Record<string, unknown> = { item_id: itemId };
  if (itemName) body.item_name = itemName;
  if (description) body.description = description;
  if (imageId) body.image = { image_id_list: [imageId] };

  await callShopeeApi<unknown>({
    config,
    path: "/api/v2/product/update_item",
    method: "POST",
    accessToken,
    shopId,
    body,
  });
}

/**
 * ลงทะเบียน callback URL รับ push กับ Shopee (API สาธารณะ ไม่ต้องใช้ token ร้าน)
 * เรียกทุกครั้งที่บันทึก Credential เพื่อให้ค่า Sandbox/Live ตรงกับคีย์ที่ใช้อยู่
 */
export async function setShopeePushConfig(
  config: ShopeeAppConfig,
  callbackUrl: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const payload = await callShopeeApi<{ result?: string }>({
      config,
      path: "/api/v2/push/set_app_push_config",
      method: "POST",
      body: {
        callback_url: callbackUrl,
        push_config: { order_status: 1, order_tracking_no: 1 },
      },
    });
    return { ok: payload.response?.result === "success", message: payload.message ?? "" };
  } catch (err) {
    return { ok: false, message: redactShopeeSecret(err instanceof Error ? err.message : String(err), config.partnerKey) };
  }
}

/** ลบสินค้าถาวร — Shopee ลบไม่ได้ถ้าสินค้ายังอยู่ในโปรโมชั่นหรือมีออเดอร์ค้าง */
export async function deleteShopeeItem(
  config: ShopeeAppConfig,
  {
    accessToken,
    shopId,
    itemId,
  }: { accessToken: string; shopId: string; itemId: number },
): Promise<void> {
  await callShopeeApi<unknown>({
    config,
    path: "/api/v2/product/delete_item",
    method: "POST",
    accessToken,
    shopId,
    body: { item_id: itemId },
  });
}
