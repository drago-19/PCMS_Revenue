import {
  getActiveCompanyId,
  query,
  queryOne,
  withTransaction,
  type CompanyId,
  type Queryable,
} from "./db";
import {
  applySellerSettingsToMemory,
  DEFAULT_SEEHENG_SELLER,
  DEFAULT_SELLER,
  type DefaultInvoicePaperSize,
  type SellerInfo,
  type VatCalculationBase,
} from "./seller";

const SETTING_KEY = "document_settings";

const globalForSettings = globalThis as unknown as {
  __pcmsSettingsCacheByCompany?: Record<
    string,
    { settings: Required<SellerInfo>; cachedAtMs: number }
  >;
};

const CACHE_TTL_MS = 2_000;

export function getCompanyDefaultSeller(
  companyId: CompanyId = "dragon19",
): Required<SellerInfo> {
  return companyId === "seeheng" ? DEFAULT_SEEHENG_SELLER : DEFAULT_SELLER;
}

function sanitizeText(raw: unknown, fallback: string, maxLen = 300): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return cleaned.slice(0, maxLen);
}

export function normalizeSellerSettings(
  input: Partial<Record<string, unknown>> | null | undefined,
  companyId: CompanyId = "dragon19",
): Required<SellerInfo> {
  const src = input ?? {};
  const fallbackSeller = getCompanyDefaultSeller(companyId);
  const name =
    sanitizeText(src.name, fallbackSeller.name, 200) || fallbackSeller.name;
  const branchName = sanitizeText(src.branchName, fallbackSeller.branchName, 100);
  const address =
    sanitizeText(src.address, fallbackSeller.address, 500) ||
    fallbackSeller.address;
  const taxId =
    sanitizeText(src.taxId, fallbackSeller.taxId, 40) || fallbackSeller.taxId;
  const phone = sanitizeText(src.phone, fallbackSeller.phone, 60);
  const email = sanitizeText(src.email, fallbackSeller.email, 120);

  const rawVat =
    src.vatRate !== undefined && src.vatRate !== null && src.vatRate !== ""
      ? Number(src.vatRate)
      : Number.NaN;
  const vatRate =
    Number.isFinite(rawVat) && rawVat >= 0 && rawVat <= 30
      ? Number(rawVat.toFixed(2))
      : DEFAULT_SELLER.vatRate;

  const cleanedPrefix = sanitizeText(
    src.invoicePrefix,
    DEFAULT_SELLER.invoicePrefix,
    32,
  )
    .toUpperCase()
    .replace(/[^\p{L}\p{M}\p{N}_/-]/gu, "");
  const invoicePrefix =
    !cleanedPrefix || cleanedPrefix === "TT"
      ? DEFAULT_SELLER.invoicePrefix
      : cleanedPrefix;

  const cleanedReceiptPrefix = sanitizeText(
    src.receiptPrefix,
    DEFAULT_SELLER.receiptPrefix,
    32,
  )
    .toUpperCase()
    .replace(/[^\p{L}\p{M}\p{N}_/-]/gu, "");
  const receiptPrefix = cleanedReceiptPrefix || DEFAULT_SELLER.receiptPrefix;

  const vatCalculationBase: VatCalculationBase =
    src.vatCalculationBase === "customer_paid" ? "customer_paid" : "payout";

  const defaultPaperSize: DefaultInvoicePaperSize =
    src.defaultPaperSize === "a4-4up" ||
    src.defaultPaperSize === "80mm" ||
    src.defaultPaperSize === "a4" ||
    src.defaultPaperSize === "a6"
      ? src.defaultPaperSize
      : DEFAULT_SELLER.defaultPaperSize;

  const showInvoiceNo =
    typeof src.showInvoiceNo === "boolean"
      ? src.showInvoiceNo
      : DEFAULT_SELLER.showInvoiceNo;

  const showReceiptNo =
    typeof src.showReceiptNo === "boolean"
      ? src.showReceiptNo
      : DEFAULT_SELLER.showReceiptNo;

  const enableFullTaxInvoice =
    typeof src.enableFullTaxInvoice === "boolean"
      ? src.enableFullTaxInvoice
      : DEFAULT_SELLER.enableFullTaxInvoice;

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
    receiptPrefix,
    vatCalculationBase,
    defaultPaperSize,
    showInvoiceNo,
    showReceiptNo,
    enableFullTaxInvoice,
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
  const companyId = await getActiveCompanyId();
  const now = Date.now();
  const cacheMap = globalForSettings.__pcmsSettingsCacheByCompany ?? {};
  const cached = cacheMap[companyId];
  if (!forceRefresh && cached && now - cached.cachedAtMs < CACHE_TTL_MS) {
    return cached.settings;
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
    // สำหรับรหัสบริษัท ดราก้อน 19 (schema public เดิม) หากยังเป็นชื่อเริ่มต้นเดิมของซีเฮงและยังไม่เคยถูกแก้ไขโดยผู้ดูแล ให้แสดงชื่อ "บริษัท ดราก้อน 19 จำกัด"
    if (
      companyId === "dragon19" &&
      typeof parsed.name === "string" &&
      /^บริษัท\s*[ซช]ีเฮง\s*จำกัด/.test(parsed.name.trim())
    ) {
      const updatedByRow = await queryOne<{ updated_by: string }>(
        "SELECT updated_by FROM app_settings WHERE setting_key = $1",
        [SETTING_KEY],
        db,
      );
      if (!updatedByRow || updatedByRow.updated_by !== "dragon19_manual") {
        parsed = {
          ...parsed,
          name: DEFAULT_SELLER.name,
        };
      }
    }
    const normalized = normalizeSellerSettings(parsed, companyId);
    globalForSettings.__pcmsSettingsCacheByCompany = {
      ...(globalForSettings.__pcmsSettingsCacheByCompany ?? {}),
      [companyId]: { settings: normalized, cachedAtMs: now },
    };
    applySellerSettingsToMemory(normalized);
    return normalized;
  } catch {
    const fallback = normalizeSellerSettings(
      getCompanyDefaultSeller(companyId),
      companyId,
    );
    applySellerSettingsToMemory(fallback);
    return fallback;
  }
}

export async function saveDocumentSettings(
  input: Partial<Record<string, unknown>>,
  meta: { actor?: string; ipAddress?: string; requestId?: string } = {},
): Promise<Required<SellerInfo>> {
  const companyId = await getActiveCompanyId();
  const normalized = normalizeSellerSettings(input, companyId);
  const actor =
    companyId === "dragon19"
      ? "dragon19_manual"
      : meta.actor || "admin";
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

    // Only normalize invoice_registry if legacy non-'SEQ/YYMM/%' rows exist (prevents rewriting billion-row tables on every settings save)
    const hasLegacyInvoiceNo = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM invoice_registry WHERE invoice_no NOT LIKE 'SEQ/____/%'
       ) AS exists`,
      [],
      client,
    );

    if (hasLegacyInvoiceNo?.exists) {
      await query(
        `WITH ordered AS (
           SELECT r.order_id,
                  CASE
                    WHEN COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) ~ '^[0-9]{4}-[0-9]{2}'
                    THEN SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 3 FOR 2)
                         || SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 6 FOR 2)
                    ELSE '0000'
                  END AS yymm,
                  ROW_NUMBER() OVER (
                    PARTITION BY
                      CASE
                        WHEN COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) ~ '^[0-9]{4}-[0-9]{2}'
                        THEN SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 3 FOR 2)
                             || SUBSTRING(COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, '')) FROM 6 FOR 2)
                        ELSE '0000'
                      END
                    ORDER BY COALESCE(NULLIF(t.paid_date, ''), NULLIF(t.created_date, ''), '9999-99-99') ASC,
                             r.created_at ASC,
                             r.order_id ASC
                  ) AS rn
           FROM invoice_registry r
           LEFT JOIN transactions t ON t.external_id = r.order_id AND t.is_order = 1
         )
         UPDATE invoice_registry r
         SET invoice_no = '__TMP_SEQ__/' || o.yymm || '/' || LPAD(o.rn::text, 5, '0')
         FROM ordered o
         WHERE r.order_id = o.order_id`,
        [],
        client,
      );

      await query(
        `UPDATE invoice_registry
         SET invoice_no = 'SEQ/' || SUBSTRING(invoice_no FROM 13)
         WHERE invoice_no LIKE '__TMP_SEQ__/%'`,
        [],
        client,
      );

      await query(
        `SELECT setval(
           'invoice_seq',
           GREATEST(1, (SELECT COUNT(*) FROM invoice_registry)),
           (SELECT COUNT(*) > 0 FROM invoice_registry)
         )`,
        [],
        client,
      );
    }

    await query(
      `INSERT INTO audit_logs (actor, action, ip_address, outcome, details_json, request_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        meta.actor || actor,
        "settings.document.update",
        ipAddress,
        "success",
        JSON.stringify(normalized),
        requestId,
      ],
      client,
    );
  }, companyId);

  globalForSettings.__pcmsSettingsCacheByCompany = {
    ...(globalForSettings.__pcmsSettingsCacheByCompany ?? {}),
    [companyId]: { settings: normalized, cachedAtMs: Date.now() },
  };
  applySellerSettingsToMemory(normalized);
  return normalized;
}
