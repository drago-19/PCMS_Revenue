import { query, queryOne, withTransaction, type Queryable } from "./db";
import {
  applySellerSettingsToMemory,
  DEFAULT_SELLER,
  type DefaultInvoicePaperSize,
  type SellerInfo,
  type VatCalculationBase,
} from "./seller";

const SETTING_KEY = "document_settings";

const globalForSettings = globalThis as unknown as {
  __pcmsSettingsCache?: Required<SellerInfo> | null;
  __pcmsSettingsCachedAtMs?: number;
};

const CACHE_TTL_MS = 2_000;

function sanitizeText(raw: unknown, fallback: string, maxLen = 300): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return cleaned.slice(0, maxLen);
}

export function normalizeSellerSettings(
  input: Partial<Record<string, unknown>> | null | undefined,
): Required<SellerInfo> {
  const src = input ?? {};
  const name =
    sanitizeText(src.name, DEFAULT_SELLER.name, 200) || DEFAULT_SELLER.name;
  const branchName = sanitizeText(src.branchName, DEFAULT_SELLER.branchName, 100);
  const address =
    sanitizeText(src.address, DEFAULT_SELLER.address, 500) ||
    DEFAULT_SELLER.address;
  const taxId =
    sanitizeText(src.taxId, DEFAULT_SELLER.taxId, 40) || DEFAULT_SELLER.taxId;
  const phone = sanitizeText(src.phone, DEFAULT_SELLER.phone, 60);
  const email = sanitizeText(src.email, DEFAULT_SELLER.email, 120);

  const rawVat =
    src.vatRate !== undefined && src.vatRate !== null && src.vatRate !== ""
      ? Number(src.vatRate)
      : Number.NaN;
  const vatRate =
    Number.isFinite(rawVat) && rawVat >= 0 && rawVat <= 30
      ? Number(rawVat.toFixed(2))
      : DEFAULT_SELLER.vatRate;

  const hasExplicitPrefix = typeof src.invoicePrefix === "string";
  const cleanedPrefix = sanitizeText(
    src.invoicePrefix,
    DEFAULT_SELLER.invoicePrefix,
    16,
  )
    .toUpperCase()
    .replace(/[^\p{L}\p{M}\p{N}_/-]/gu, "");
  const invoicePrefix = hasExplicitPrefix
    ? cleanedPrefix
    : cleanedPrefix || DEFAULT_SELLER.invoicePrefix;

  const vatCalculationBase: VatCalculationBase =
    src.vatCalculationBase === "customer_paid" ? "customer_paid" : "payout";

  const defaultPaperSize: DefaultInvoicePaperSize =
    src.defaultPaperSize === "a4-4up" ||
    src.defaultPaperSize === "80mm" ||
    src.defaultPaperSize === "a4" ||
    src.defaultPaperSize === "a6"
      ? src.defaultPaperSize
      : DEFAULT_SELLER.defaultPaperSize;

  const showSkuInAbbreviated =
    typeof src.showSkuInAbbreviated === "boolean"
      ? src.showSkuInAbbreviated
      : DEFAULT_SELLER.showSkuInAbbreviated;

  const showSkuInFull =
    typeof src.showSkuInFull === "boolean"
      ? src.showSkuInFull
      : DEFAULT_SELLER.showSkuInFull;

  const showFeeBreakdown =
    typeof src.showFeeBreakdown === "boolean"
      ? src.showFeeBreakdown
      : DEFAULT_SELLER.showFeeBreakdown;

  const showShippingTracking =
    typeof src.showShippingTracking === "boolean"
      ? src.showShippingTracking
      : DEFAULT_SELLER.showShippingTracking;

  const showSignatureBlock =
    typeof src.showSignatureBlock === "boolean"
      ? src.showSignatureBlock
      : DEFAULT_SELLER.showSignatureBlock;

  const footerNote = sanitizeText(src.footerNote, DEFAULT_SELLER.footerNote, 300);

  return {
    name,
    branchName,
    address,
    taxId,
    phone,
    email,
    vatRate,
    invoicePrefix,
    vatCalculationBase,
    defaultPaperSize,
    showSkuInAbbreviated,
    showSkuInFull,
    showFeeBreakdown,
    showShippingTracking,
    showSignatureBlock,
    footerNote,
  };
}

export async function getDocumentSettings(
  db?: Queryable,
  forceRefresh = false,
): Promise<Required<SellerInfo>> {
  const now = Date.now();
  if (
    !forceRefresh &&
    globalForSettings.__pcmsSettingsCache &&
    now - (globalForSettings.__pcmsSettingsCachedAtMs ?? 0) < CACHE_TTL_MS
  ) {
    return globalForSettings.__pcmsSettingsCache;
  }

  try {
    const row = await queryOne<{ value_json: unknown }>(
      "SELECT value_json FROM app_settings WHERE setting_key = $1",
      [SETTING_KEY],
      db,
    );
    let parsed: Partial<Record<string, unknown>> = {};
    if (row?.value_json) {
      if (typeof row.value_json === "string") {
        parsed = JSON.parse(row.value_json) as Partial<Record<string, unknown>>;
      } else if (typeof row.value_json === "object") {
        parsed = row.value_json as Partial<Record<string, unknown>>;
      }
    }
    const normalized = normalizeSellerSettings(parsed);
    globalForSettings.__pcmsSettingsCache = normalized;
    globalForSettings.__pcmsSettingsCachedAtMs = now;
    applySellerSettingsToMemory(normalized);
    return normalized;
  } catch {
    const fallback = normalizeSellerSettings(DEFAULT_SELLER);
    applySellerSettingsToMemory(fallback);
    return fallback;
  }
}

export async function saveDocumentSettings(
  input: Partial<Record<string, unknown>>,
  meta: { actor?: string; ipAddress?: string; requestId?: string } = {},
): Promise<Required<SellerInfo>> {
  const normalized = normalizeSellerSettings(input);
  const actor = meta.actor || "admin";
  const ipAddress = meta.ipAddress || "unknown";
  const requestId = meta.requestId ?? null;

  await withTransaction(async (client) => {
    await query(
      `CREATE TABLE IF NOT EXISTS app_settings (
         setting_key TEXT PRIMARY KEY,
         value_json JSONB NOT NULL DEFAULT '{}',
         updated_by TEXT NOT NULL DEFAULT 'system',
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      [],
      client,
    );

    await query(
      `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (setting_key) DO UPDATE SET
         value_json = EXCLUDED.value_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [SETTING_KEY, JSON.stringify(normalized), actor],
      client,
    );

    await query(
      `INSERT INTO audit_logs (actor, action, ip_address, outcome, details_json, request_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        actor,
        "settings.document.update",
        ipAddress,
        "success",
        JSON.stringify(normalized),
        requestId,
      ],
      client,
    );
  });

  globalForSettings.__pcmsSettingsCache = normalized;
  globalForSettings.__pcmsSettingsCachedAtMs = Date.now();
  applySellerSettingsToMemory(normalized);
  return normalized;
}
