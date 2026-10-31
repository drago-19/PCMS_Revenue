import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type CompanyId,
} from "./session-token";

const SCHEMA_VERSION = "2026-10-31-v20";

export type { CompanyId };

export const companyContextStorage = new AsyncLocalStorage<CompanyId>();

export function runWithCompany<T>(companyId: CompanyId, fn: () => T): T {
  return companyContextStorage.run(companyId, fn);
}

export async function getActiveCompanyId(): Promise<CompanyId> {
  const fromStorage = companyContextStorage.getStore();
  if (fromStorage === "seeheng" || fromStorage === "dragon19") {
    return fromStorage;
  }
  try {
    const { cookies, headers } = await import("next/headers");
    const hdrs = await headers();
    const fromHeader = hdrs.get("x-auth-company");
    if (fromHeader === "seeheng" || fromHeader === "dragon19") {
      return fromHeader;
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);
    if (session?.companyId === "seeheng") {
      return "seeheng";
    }
  } catch {
    // Outside Next.js request context (e.g., CLI or unit tests)
  }
  return "dragon19";
}

function getSchemaSearchPathSql(companyId: CompanyId): string {
  return companyId === "seeheng"
    ? "SET LOCAL search_path TO seeheng, public"
    : "SET LOCAL search_path TO public";
}

const globalForDb = globalThis as unknown as {
  __pcmsRevenuePool?: Pool;
  __pcmsRevenueSchema?: Promise<void>;
  __pcmsRevenueSchemaVersion?: string;
};

type Queryable = Pool | PoolClient;

export type { Queryable };

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? "postgres",
    password:
      process.env.PGPASSWORD ?? process.env.SUPABASE_POSTGRES_PASSWORD ?? "",
    database: process.env.PGDATABASE ?? "pcms_revenue",
  };
}

export function getPool(): Pool {
  if (!globalForDb.__pcmsRevenuePool) {
    const pool = new Pool({ ...connectionConfig(), max: 10 });
    pool.on("error", (error) => {
      console.error("postgres pool error", error);
    });
    globalForDb.__pcmsRevenuePool = pool;
  }
  return globalForDb.__pcmsRevenuePool;
}

export function ensureSchema(): Promise<void> {
  if (
    !globalForDb.__pcmsRevenueSchema ||
    globalForDb.__pcmsRevenueSchemaVersion !== SCHEMA_VERSION
  ) {
    globalForDb.__pcmsRevenueSchemaVersion = SCHEMA_VERSION;
    globalForDb.__pcmsRevenueSchema = (async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Fast-path: ตรวจสอบ version ในฐานข้อมูลเพื่อหลีกเลี่ยงการรัน DDL 1,200 บรรทัดซ้ำทุกครั้งที่สตาร์ท
        await client.query(`
          CREATE TABLE IF NOT EXISTS app_schema_version (
            schema_name TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        const { rows } = await client.query<{
          schema_name: string;
          version: string;
        }>(
          `SELECT schema_name, version FROM app_schema_version WHERE schema_name IN ('public', 'seeheng')`,
        );
        const publicVer = rows.find((r) => r.schema_name === "public")?.version;
        const seehengVer = rows.find((r) => r.schema_name === "seeheng")?.version;
        if (publicVer === SCHEMA_VERSION && seehengVer === SCHEMA_VERSION) {
          return;
        }

        await client.query("SET search_path TO public");
        await client.query(SCHEMA_SQL);
        await client.query(
          `INSERT INTO app_schema_version (schema_name, version, applied_at)
           VALUES ('public', $1, now())
           ON CONFLICT (schema_name) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
          [SCHEMA_VERSION],
        );

        await client.query("CREATE SCHEMA IF NOT EXISTS seeheng");
        await client.query("SET search_path TO seeheng, public");
        await client.query(SCHEMA_SQL);
        await client.query(
          `INSERT INTO public.app_schema_version (schema_name, version, applied_at)
           VALUES ('seeheng', $1, now())
           ON CONFLICT (schema_name) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
          [SCHEMA_VERSION],
        );

        await client.query("SET search_path TO public");
      } finally {
        client.release();
      }
    })().catch((err) => {
      globalForDb.__pcmsRevenueSchema = undefined;
      globalForDb.__pcmsRevenueSchemaVersion = undefined;
      throw err;
    });
  }
  return globalForDb.__pcmsRevenueSchema;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db?: Queryable,
): Promise<T[]> {
  if (!db) {
    await ensureSchema();
  }
  const target = db ?? getPool();
  if (target === getPool()) {
    const companyId = await getActiveCompanyId();
    if (companyId === "seeheng") {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(getSchemaSearchPathSql("seeheng"));
        const result = await client.query<T>(text, params as never[]);
        await client.query("COMMIT");
        return result.rows;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  }
  const result = await target.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  companyOverride?: CompanyId,
): Promise<T> {
  await ensureSchema();
  const companyId = companyOverride ?? (await getActiveCompanyId());
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(getSchemaSearchPathSql(companyId));
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function buildOrderShippingPositiveSql(alias = "t"): string {
  const p = alias ? `${alias}.` : "";
  return `(
    CASE
      WHEN ${p}is_order <> 1 THEN 0
      WHEN ${p}channel IN ('Shopee', 'Facebook') THEN
        GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
      ELSE
        GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingPlatformDiscount')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingSubsidy')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'guaranteeReimbursement')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'exchangeShipping')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'replacementShipping')::numeric, 0))
        + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingRefund')::numeric, 0))
        + CASE
            WHEN ${p}transaction_type <> 'คำสั่งซื้อ (OMS)' THEN
              GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'shippingActual')::numeric, 0))
              + GREATEST(0, COALESCE((${p}normalized_json->'fields'->>'returnShippingActual')::numeric, 0))
            ELSE 0
          END
    END
  )`;
}

export function buildOrderShippingNegativeSql(alias = "t"): string {
  const p = alias ? `${alias}.` : "";
  return `(
    CASE
      WHEN ${p}is_order <> 1 OR ${p}channel IN ('Shopee', 'Facebook') THEN 0
      ELSE
        LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingCustomerFee')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingPlatformDiscount')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingSubsidy')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'guaranteeReimbursement')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'exchangeShipping')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'replacementShipping')::numeric, 0))
        + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingRefund')::numeric, 0))
        + CASE
            WHEN ${p}transaction_type <> 'คำสั่งซื้อ (OMS)' THEN
              LEAST(0, COALESCE((${p}normalized_json->'fields'->>'shippingActual')::numeric, 0))
              + LEAST(0, COALESCE((${p}normalized_json->'fields'->>'returnShippingActual')::numeric, 0))
            ELSE 0
          END
    END
  )`;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS imports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  sheet_name TEXT,
  header_row INTEGER,
  period_start TEXT,
  period_end TEXT,
  timezone TEXT,
  currency TEXT,
  header_signature TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  row_count INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  warnings_json JSONB NOT NULL DEFAULT '[]',
  mapping_json JSONB NOT NULL DEFAULT '[]',
  unknown_columns_json JSONB NOT NULL DEFAULT '[]',
  report_json JSONB NOT NULL DEFAULT '{}',
  reconciliation_json JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  is_order INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL DEFAULT '',
  paid_date TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'THB',
  income DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustment DOUBLE PRECISION NOT NULL DEFAULT 0,
  payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  related_order_id TEXT,
  product_detail TEXT,
  weight_estimated DOUBLE PRECISION,
  weight_charged DOUBLE PRECISION,
  checks_json JSONB NOT NULL DEFAULT '{}',
  warnings_json JSONB NOT NULL DEFAULT '[]',
  normalized_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_key
  ON transactions(external_id, transaction_type, paid_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_order
  ON transactions(external_id) WHERE is_order = 1;
CREATE INDEX IF NOT EXISTS ix_transactions_paid_date ON transactions(paid_date);
CREATE INDEX IF NOT EXISTS ix_transactions_import ON transactions(import_id);

CREATE SEQUENCE IF NOT EXISTS invoice_seq;

CREATE TABLE IF NOT EXISTS invoice_registry (
  order_id TEXT PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ล็อกเลขที่ใบกำกับฯ (ออกแล้วห้ามเปลี่ยน): เก็บ yymm/seq เป็นคอลัมน์จริง + สถานะ void แทนการลบ (Backward Compatible: nullable ก่อน)
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS yymm TEXT;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE invoice_registry ADD COLUMN IF NOT EXISTS void_reason TEXT;
UPDATE invoice_registry
SET yymm = SUBSTRING(invoice_no FROM 5 FOR 4),
    seq = SUBSTRING(invoice_no FROM 10)::bigint
WHERE seq IS NULL AND invoice_no ~ '^SEQ/[0-9]{4}/[0-9]{1,15}$';
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_registry_yymm_seq ON invoice_registry (yymm, seq);
CREATE INDEX IF NOT EXISTS ix_invoice_registry_print
  ON invoice_registry (yymm, status, channel, seq) INCLUDE (order_id);
CREATE INDEX IF NOT EXISTS ix_invoice_registry_print_all
  ON invoice_registry (yymm, status, seq) INCLUDE (order_id, channel);
CREATE TABLE IF NOT EXISTS invoice_registry_audit (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  import_id INTEGER,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_invoice_registry_audit_order ON invoice_registry_audit (order_id);

ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'settlement';
ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_blob BYTEA;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'TikTok';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS oms_order_uid TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_tax_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_address TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE is_order = 1
      AND channel = 'Facebook'
      AND COALESCE((normalized_json->'fields'->>'productAfterDiscount')::numeric, 0) <= 0
      AND COALESCE((normalized_json->'fields'->>'productBeforeDiscount')::numeric, 0) <= 0
      AND link_priority = 0
    LIMIT 1
  ) THEN
    ALTER TABLE transactions DROP COLUMN link_priority;
  END IF;
EXCEPTION WHEN undefined_column THEN
  NULL;
END $$;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS link_priority SMALLINT GENERATED ALWAYS AS (
  CASE
    WHEN (
      channel = 'Facebook'
      AND COALESCE((normalized_json->'fields'->>'productAfterDiscount')::numeric, 0) <= 0
      AND COALESCE((normalized_json->'fields'->>'productBeforeDiscount')::numeric, 0) <= 0
    ) THEN 3
    WHEN (
      order_code IS NOT NULL AND order_code <> ''
      AND (
        transaction_type <> 'คำสั่งซื้อ (OMS)'
        OR (channel IN ('Shopee', 'Facebook') AND NULLIF(product_detail, '') IS NOT NULL)
      )
    ) THEN 0
    WHEN (order_code IS NOT NULL AND order_code <> '') THEN 1
    ELSE 2
  END
) STORED;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_positive DOUBLE PRECISION GENERATED ALWAYS AS (
  ${buildOrderShippingPositiveSql("")}
) STORED;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_negative DOUBLE PRECISION GENERATED ALWAYS AS (
  ${buildOrderShippingNegativeSql("")}
) STORED;

CREATE INDEX IF NOT EXISTS ix_transactions_channel ON transactions(channel);
CREATE INDEX IF NOT EXISTS ix_transactions_order_code ON transactions(order_code);
CREATE INDEX IF NOT EXISTS ix_transactions_oms_order_uid ON transactions(oms_order_uid);

CREATE TABLE IF NOT EXISTS oms_orders (
  order_uid TEXT PRIMARY KEY,
  order_code TEXT NOT NULL,
  import_id BIGINT REFERENCES imports(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'TikTok',
  customer_name TEXT,
  customer_phone TEXT,
  contact_name TEXT,
  courier TEXT,
  shipping_fee_customer DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_fee_seller DOUBLE PRECISION NOT NULL DEFAULT 0,
  province TEXT,
  bank TEXT,
  tracking_no TEXT,
  note TEXT,
  created_by TEXT,
  created_date TEXT NOT NULL DEFAULT '',
  paid_date TEXT NOT NULL DEFAULT '',
  printed_date TEXT NOT NULL DEFAULT '',
  marketplace_order_raw TEXT,
  marketplace_order_norm TEXT,
  marketplace_order_prefix TEXT,
  marketplace_order_float DOUBLE PRECISION,
  discount_code TEXT,
  discount_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_qty INTEGER NOT NULL DEFAULT 0,
  sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  profit_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  matched_external_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oms_orders ADD COLUMN IF NOT EXISTS order_uid TEXT;

CREATE INDEX IF NOT EXISTS ix_oms_orders_order_code ON oms_orders(order_code);
CREATE INDEX IF NOT EXISTS ix_oms_orders_mp_norm ON oms_orders(marketplace_order_norm);
CREATE INDEX IF NOT EXISTS ix_oms_orders_mp_prefix ON oms_orders(marketplace_order_prefix);
CREATE INDEX IF NOT EXISTS ix_oms_orders_matched_ext ON oms_orders(matched_external_id);
CREATE INDEX IF NOT EXISTS ix_oms_orders_paid_date ON oms_orders(paid_date);
CREATE INDEX IF NOT EXISTS ix_oms_orders_channel ON oms_orders(channel);
CREATE INDEX IF NOT EXISTS ix_oms_orders_import ON oms_orders(import_id);
CREATE INDEX IF NOT EXISTS ix_oms_orders_unmatched ON oms_orders(order_code)
  WHERE matched_external_id IS NULL;

CREATE TABLE IF NOT EXISTS oms_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT REFERENCES imports(id) ON DELETE CASCADE,
  order_uid TEXT NOT NULL DEFAULT '',
  order_code TEXT NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  sku_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  order_sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_fee_customer DOUBLE PRECISION NOT NULL DEFAULT 0,
  sender_name TEXT,
  customer_name TEXT,
  customer_address TEXT,
  postal_code TEXT,
  customer_phone TEXT,
  paid_date TEXT NOT NULL DEFAULT '',
  created_date TEXT NOT NULL DEFAULT '',
  courier TEXT,
  channel TEXT NOT NULL DEFAULT 'TikTok',
  bank TEXT,
  note TEXT,
  tracking_no TEXT,
  UNIQUE(order_uid, line_no)
);

ALTER TABLE oms_order_items ADD COLUMN IF NOT EXISTS order_uid TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_oms_items_order_uid ON oms_order_items(order_uid);
CREATE INDEX IF NOT EXISTS ix_oms_items_order_code ON oms_order_items(order_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_sku_code ON oms_order_items(sku_code);
CREATE INDEX IF NOT EXISTS ix_oms_items_import ON oms_order_items(import_id);
CREATE INDEX IF NOT EXISTS ix_oms_items_paid_date ON oms_order_items(paid_date);
CREATE INDEX IF NOT EXISTS ix_oms_items_created_date ON oms_order_items(created_date);

CREATE TABLE IF NOT EXISTS products (
  sku_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  default_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  paid_date TEXT PRIMARY KEY,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  order_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  order_income DOUBLE PRECISION NOT NULL DEFAULT 0,
  order_fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  other_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_payout DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustment DOUBLE PRECISION NOT NULL DEFAULT 0,
  tiktok_count INTEGER NOT NULL DEFAULT 0,
  shopee_count INTEGER NOT NULL DEFAULT 0,
  facebook_count INTEGER NOT NULL DEFAULT 0,
  linked_count INTEGER NOT NULL DEFAULT 0,
  oms_only_count INTEGER NOT NULL DEFAULT 0,
  unlinked_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  shipping_positive DOUBLE PRECISION NOT NULL DEFAULT 0,
  shipping_negative DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS linked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS oms_only_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS unlinked_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS mismatch_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS shipping_positive DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS shipping_negative DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sku_summaries (
  sku_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  total_qty INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_sales_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  tiktok_qty INTEGER NOT NULL DEFAULT 0,
  shopee_qty INTEGER NOT NULL DEFAULT 0,
  facebook_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_ext
  ON transactions(paid_date DESC, external_id DESC)
  WHERE is_order = 1;

DROP INDEX IF EXISTS ix_transactions_order_paid_priority_ext;
CREATE INDEX IF NOT EXISTS ix_transactions_order_paid_priority_ext_v2
  ON transactions(paid_date DESC, link_priority ASC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_priority_ext
  ON transactions(channel, paid_date DESC, link_priority ASC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_link_paid_priority_ext
  ON transactions(link_priority, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_link_paid_ext
  ON transactions(channel, link_priority, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_orders_summary_cover
  ON transactions(channel, link_priority, paid_date)
  INCLUDE (income, fee_total, payout, shipping_positive, shipping_negative)
  WHERE is_order = 1 AND income > 0;

CREATE INDEX IF NOT EXISTS ix_transactions_channel_paid_ext
  ON transactions(channel, paid_date DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_unlinked_created_date
  ON transactions(paid_date, created_date DESC)
  WHERE is_order = 1
    AND (order_code IS NULL OR order_code = '')
    AND created_date <> ''
    AND created_date <> 'unknown';

CREATE INDEX IF NOT EXISTS ix_transactions_unlinked_created_date_v2
  ON transactions(created_date DESC, channel, paid_date)
  WHERE is_order = 1
    AND (order_code IS NULL OR order_code = '')
    AND created_date <> ''
    AND created_date <> 'unknown';

CREATE INDEX IF NOT EXISTS ix_transactions_order_payout
  ON transactions(payout DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_order_income
  ON transactions(income DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_non_positive_income
  ON transactions(paid_date, channel, income, fee_total, payout)
  WHERE is_order = 1 AND income <= 0;

CREATE INDEX IF NOT EXISTS ix_transactions_non_positive_cover
  ON transactions(paid_date, channel, link_priority)
  INCLUDE (income, fee_total, payout, shipping_positive, shipping_negative)
  WHERE is_order = 1 AND income <= 0;

CREATE INDEX IF NOT EXISTS ix_transactions_order_fee
  ON transactions(ABS(fee_total) DESC, external_id DESC)
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_order_mismatch
  ON transactions(paid_date DESC, external_id DESC)
  WHERE is_order = 1
    AND (
      ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
      OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
      OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
    );

CREATE INDEX IF NOT EXISTS ix_transactions_search_trgm
  ON transactions USING gin (
    (external_id || ' ' || COALESCE(order_code, '') || ' ' || COALESCE(product_detail, '')) gin_trgm_ops
  )
  WHERE is_order = 1;

CREATE INDEX IF NOT EXISTS ix_transactions_ext_prefix15
  ON transactions(LEFT(external_id, 15))
  WHERE is_order = 1 AND transaction_type <> 'คำสั่งซื้อ (OMS)';

CREATE INDEX IF NOT EXISTS ix_transactions_oms_temp
  ON transactions(order_code)
  WHERE transaction_type = 'คำสั่งซื้อ (OMS)';

CREATE INDEX IF NOT EXISTS ix_transactions_missing_product_detail
  ON transactions(order_code)
  WHERE is_order = 1
    AND order_code IS NOT NULL
    AND order_code <> ''
    AND product_detail IS NULL;

CREATE INDEX IF NOT EXISTS ix_sku_summaries_sort
  ON sku_summaries(total_qty DESC, net_sales_amount DESC, sku_code ASC);

CREATE INDEX IF NOT EXISTS ix_sku_summaries_trgm
  ON sku_summaries USING gin (
    (sku_code || ' ' || product_name) gin_trgm_ops
  );

CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  ip_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  outcome TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'slate',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_expense_categories_sort ON expense_categories(sort_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS monthly_expenses (
  year_month TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year_month, category_id)
);

CREATE INDEX IF NOT EXISTS ix_monthly_expenses_ym ON monthly_expenses(year_month);

CREATE TABLE IF NOT EXISTS expense_records (
  id BIGSERIAL PRIMARY KEY,
  entry_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_expense_records_ym ON expense_records(year_month);
CREATE INDEX IF NOT EXISTS ix_expense_records_date ON expense_records(entry_date DESC);
CREATE INDEX IF NOT EXISTS ix_expense_records_cat ON expense_records(category_id);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only (UPDATE and DELETE are prohibited)';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_immutable' AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;

  -- Migrate oms_orders primary key from order_code to order_uid and oms_order_items unique constraint to (order_uid, line_no)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'oms_orders'::regclass
      AND c.contype = 'p'
      AND a.attname = 'order_code'
  ) THEN
    UPDATE oms_orders
    SET order_uid = order_code || '|' || SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) || '|' || COALESCE(NULLIF(NULLIF(tracking_no, '-'), '--'), NULLIF(paid_date, ''), created_date)
    WHERE order_uid IS NULL OR order_uid = '';

    ALTER TABLE oms_orders ALTER COLUMN order_uid SET NOT NULL;
    ALTER TABLE oms_orders DROP CONSTRAINT oms_orders_pkey;
    ALTER TABLE oms_orders ADD PRIMARY KEY (order_uid);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'oms_order_items'::regclass
      AND c.conname = 'oms_order_items_order_code_line_no_key'
  ) THEN
    UPDATE oms_order_items
    SET order_uid = order_code || '|' || SUBSTRING(COALESCE(NULLIF(paid_date, ''), created_date) FROM 1 FOR 7) || '|' || COALESCE(NULLIF(NULLIF(tracking_no, '-'), '--'), NULLIF(paid_date, ''), created_date)
    WHERE order_uid IS NULL OR order_uid = '';

    ALTER TABLE oms_order_items DROP CONSTRAINT oms_order_items_order_code_line_no_key;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'oms_order_items'::regclass
        AND c.conname = 'oms_order_items_order_uid_line_no_key'
    ) THEN
      ALTER TABLE oms_order_items ADD CONSTRAINT oms_order_items_order_uid_line_no_key UNIQUE (order_uid, line_no);
    END IF;
  END IF;

  -- Fast check on pre-aggregated summary tables only (never full-scan billion-row tables on startup)
  IF EXISTS (
    SELECT 1 FROM daily_summaries WHERE order_count > 0 AND linked_count = 0 AND oms_only_count = 0 AND unlinked_count = 0
  ) OR EXISTS (
    SELECT 1 FROM daily_summaries WHERE order_count > 0 AND shipping_positive = 0 AND shipping_negative = 0
  ) THEN
    DELETE FROM oms_order_items WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook');
    DELETE FROM oms_orders WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook');
    DELETE FROM transactions WHERE COALESCE(NULLIF(channel, ''), 'TikTok') NOT IN ('TikTok', 'Shopee', 'Facebook');

    DELETE FROM products p
    WHERE NOT EXISTS (
      SELECT 1 FROM oms_order_items i WHERE i.sku_code = p.sku_code
    );

    -- เลขที่ใบกำกับฯ ล็อกแล้ว: ไม่ลบ → void แทน
    UPDATE invoice_registry r
    SET status = 'void', voided_at = now(), void_reason = 'ไม่พบออเดอร์ในระบบ'
    WHERE r.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t WHERE t.external_id = r.order_id AND t.is_order = 1
      );

    DELETE FROM daily_summaries;
    INSERT INTO daily_summaries (
      paid_date, transaction_count, order_count, order_payout, order_income,
      order_fees, other_count, other_payout, total_payout, adjustment,
      tiktok_count, shopee_count, facebook_count,
      linked_count, oms_only_count, unlinked_count, mismatch_count,
      shipping_positive, shipping_negative, updated_at
    )
    SELECT
      paid_date,
      COUNT(*)::int,
      SUM(CASE WHEN is_order = 1 THEN 1 ELSE 0 END)::int,
      ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2),
      ROUND(SUM(CASE WHEN is_order = 1 THEN income ELSE 0 END)::numeric, 2),
      ROUND(SUM(CASE WHEN is_order = 1 THEN fee_total ELSE 0 END)::numeric, 2),
      SUM(CASE WHEN is_order = 0 THEN 1 ELSE 0 END)::int,
      ROUND(SUM(CASE WHEN is_order = 0 THEN payout ELSE 0 END)::numeric, 2),
      ROUND(SUM(payout)::numeric, 2),
      ROUND(SUM(adjustment)::numeric, 2),
      SUM(CASE WHEN is_order = 1 AND COALESCE(NULLIF(channel, ''), 'TikTok') = 'TikTok' THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND channel = 'Shopee' THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND channel = 'Facebook' THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND order_code IS NOT NULL AND order_code <> '' AND (transaction_type <> 'คำสั่งซื้อ (OMS)' OR (channel IN ('Shopee', 'Facebook') AND NULLIF(product_detail, '') IS NOT NULL)) THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND order_code IS NOT NULL AND order_code <> '' AND NOT (transaction_type <> 'คำสั่งซื้อ (OMS)' OR (channel IN ('Shopee', 'Facebook') AND NULLIF(product_detail, '') IS NOT NULL)) THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND (order_code IS NULL OR order_code = '') THEN 1 ELSE 0 END)::int,
      SUM(CASE WHEN is_order = 1 AND (
        ABS(COALESCE((checks_json->>'incomeDiff')::numeric, 0)) >= 0.01
        OR ABS(COALESCE((checks_json->>'feeDiff')::numeric, 0)) >= 0.01
        OR ABS(COALESCE((checks_json->>'payoutDiff')::numeric, 0)) >= 0.01
      ) THEN 1 ELSE 0 END)::int,
      ROUND(COALESCE(SUM(${buildOrderShippingPositiveSql("")}), 0)::numeric, 2),
      ROUND(COALESCE(SUM(${buildOrderShippingNegativeSql("")}), 0)::numeric, 2),
      now()
    FROM transactions
    WHERE paid_date <> '' AND paid_date <> 'unknown'
      AND COALESCE(NULLIF(channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook')
    GROUP BY paid_date;

    DELETE FROM sku_summaries;
    INSERT INTO sku_summaries (
      sku_code, product_name, total_qty, order_count, gross_amount,
      net_sales_amount, tiktok_qty, shopee_qty, facebook_qty, updated_at
    )
    SELECT
      i.sku_code,
      MAX(i.product_name),
      COALESCE(SUM(i.quantity), 0)::int,
      COUNT(DISTINCT COALESCE(NULLIF(i.order_uid, ''), i.order_code))::int,
      ROUND(COALESCE(SUM(i.unit_price * i.quantity), 0)::numeric, 2),
      ROUND(COALESCE(SUM(i.order_sales_amount), 0)::numeric, 2),
      COALESCE(SUM(CASE WHEN COALESCE(NULLIF(i.channel, ''), 'TikTok') = 'TikTok' THEN i.quantity ELSE 0 END), 0)::int,
      COALESCE(SUM(CASE WHEN i.channel = 'Shopee' THEN i.quantity ELSE 0 END), 0)::int,
      COALESCE(SUM(CASE WHEN i.channel = 'Facebook' THEN i.quantity ELSE 0 END), 0)::int,
      now()
    FROM oms_order_items i
    WHERE COALESCE(NULLIF(i.channel, ''), 'TikTok') IN ('TikTok', 'Shopee', 'Facebook')
    GROUP BY i.sku_code;
  END IF;

  -- invoice_registry: เลขที่ใบกำกับฯ ถูกล็อกแล้ว (ห้ามลบ/เรียงใหม่) — การ void/ออกเลขใหม่ทำใน syncMonthlyInvoiceRegistry เท่านั้น
  -- และเติม channel ให้แถวเก่าที่ยังไม่มี (ทำครั้งเดียว)
  UPDATE invoice_registry r SET channel = t.channel FROM transactions t
  WHERE r.channel IS NULL AND t.external_id = r.order_id AND t.is_order = 1;

  -- Platform Financial Isolation (AGENTS.md Rule 3 & 4):
  -- 1. TikTok OMS placeholder rows (before Settlement): payout = income + fee_total (sales_amount - shipping_fee_seller), cogs = 0
  -- 2. Shopee & Facebook (Shipnity 2-file channels): payout = o.profit_amount directly from Shipnity file, cogs = GREATEST(0, income + fee_total - o.profit_amount)
  -- 3. Remove invoice_registry entries for non-billable orders (link_priority = 3 or Shopee/Facebook orders with payout <= 0)
  IF EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel = 'TikTok'
      AND ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM transactions t
    JOIN oms_orders o ON o.order_uid = t.oms_order_uid
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel IN ('Shopee', 'Facebook')
      AND ABS(t.payout - ROUND(o.profit_amount::numeric, 2)) >= 0.01
    LIMIT 1
  ) THEN
    UPDATE transactions t
    SET payout = ROUND((t.income + t.fee_total)::numeric, 2),
        normalized_json = jsonb_set(
          jsonb_set(
            t.normalized_json,
            '{fields,payout}',
            to_jsonb(ROUND((t.income + t.fee_total)::numeric, 2))
          ),
          '{fields,cogs}',
          to_jsonb(0)
        )
    WHERE t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel = 'TikTok'
      AND ABS(t.payout - ROUND((t.income + t.fee_total)::numeric, 2)) >= 0.01;

    UPDATE transactions t
    SET payout = ROUND(o.profit_amount::numeric, 2),
        normalized_json = jsonb_set(
          jsonb_set(
            t.normalized_json,
            '{fields,payout}',
            to_jsonb(ROUND(o.profit_amount::numeric, 2))
          ),
          '{fields,cogs}',
          to_jsonb(GREATEST(0, ROUND((t.income + t.fee_total - o.profit_amount)::numeric, 2)))
        )
    FROM oms_orders o
    WHERE t.oms_order_uid = o.order_uid
      AND t.is_order = 1
      AND t.transaction_type = 'คำสั่งซื้อ (OMS)'
      AND t.channel IN ('Shopee', 'Facebook')
      AND (
        ABS(t.payout - ROUND(o.profit_amount::numeric, 2)) >= 0.01
        OR COALESCE((t.normalized_json->'fields'->>'cogs')::numeric, -1) IS DISTINCT FROM GREATEST(0, ROUND((t.income + t.fee_total - o.profit_amount)::numeric, 2))
      );

    -- เลขที่ใบกำกับฯ ล็อกแล้ว: ไม่ลบ → void แทน
    UPDATE invoice_registry r
    SET status = 'void', voided_at = now(), void_reason = 'ไม่เข้าเงื่อนไขบิลขายปกติ'
    WHERE r.status = 'active'
      AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.external_id = r.order_id
        AND t.is_order = 1
        AND (
          t.link_priority = 3
          OR (t.channel = 'Shopee' AND (t.income <= 0 OR t.payout <= 0))
          OR (t.channel = 'Facebook' AND (t.income <= 0 OR t.payout <= 0))
        )
    );

    UPDATE daily_summaries d
    SET order_payout = s.order_payout,
        total_payout = s.total_payout
    FROM (
      SELECT paid_date,
             ROUND(SUM(CASE WHEN is_order = 1 THEN payout ELSE 0 END)::numeric, 2) AS order_payout,
             ROUND(SUM(payout)::numeric, 2) AS total_payout
      FROM transactions
      WHERE paid_date <> '' AND paid_date <> 'unknown'
        AND channel IN ('TikTok', 'Shopee', 'Facebook')
      GROUP BY paid_date
    ) s
    WHERE d.paid_date = s.paid_date
      AND (d.order_payout IS DISTINCT FROM s.order_payout OR d.total_payout IS DISTINCT FROM s.total_payout);
  END IF;
END $$;

ANALYZE transactions;
`;
